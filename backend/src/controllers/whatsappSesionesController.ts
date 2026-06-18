import { Request, Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middlewares/authMiddleware';
import whatsappService from '../services/whatsapp/whatsappService';

function buildSessionKey(sedeId: number | string, deviceName: string): string {
  const slug = String(deviceName || 'dispositivo')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30) || 'dispositivo';

  return `sede-${sedeId}-${slug}-${Date.now()}`;
}

async function obtenerSesionPorId(id: string, sedeId: number | null | undefined) {
  const [rows]: any = await pool.query(
    `SELECT id, sede_id, nombre_dispositivo, numero_whatsapp, session_key, estado, activo, ultima_conexion, created_at
     FROM whatsapp_sesiones
     WHERE id = ? AND sede_id = ?
     LIMIT 1`,
    [id, sedeId]
  );

  return rows[0] || null;
}

async function obtenerSesionPorSede(sedeId: number | null | undefined) {
  const [rows]: any = await pool.query(
    `SELECT id, sede_id, nombre_dispositivo, numero_whatsapp, session_key, estado, activo, ultima_conexion, created_at
     FROM whatsapp_sesiones
     WHERE sede_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [sedeId]
  );

  return rows[0] || null;
}

// Función eliminada ya que usamos BullMQ

type EvolutionConnectionStatus =
  | 'connected'
  | 'initializing'
  | 'disconnected'
  | null;

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'si'].includes(value);
}

function toTime(value: unknown): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : 0;
}

function wasRecentlyConnected(session: any, graceMs: number): boolean {
  const lastConnection = toTime(session?.ultima_conexion);
  return lastConnection > 0 && Date.now() - lastConnection <= graceMs;
}

function mapEvolutionConnectionState(state: unknown): EvolutionConnectionStatus {
  const normalized = String(state || '').trim().toLowerCase();

  if (normalized === 'open' || normalized === 'connected') return 'connected';
  if (normalized === 'connecting') return 'initializing';
  if (normalized === 'close' || normalized === 'disconnected') return 'disconnected';

  return null;
}

async function syncWhatsappSessionStatus(sessionKey: string, estado: string, updateLastConnection = false) {
  const query = updateLastConnection
    ? `UPDATE whatsapp_sesiones
       SET estado = ?, ultima_conexion = NOW()
       WHERE session_key = ?
         AND (estado <> ? OR estado IS NULL OR ultima_conexion IS NULL)`
    : `UPDATE whatsapp_sesiones
       SET estado = ?
       WHERE session_key = ?
         AND (estado <> ? OR estado IS NULL)`;

  await pool.query(query, [estado, sessionKey, estado]);
}

function logEvolutionWebhook(message: string) {
  if (envBoolean('EVOLUTION_WEBHOOK_DEBUG', false)) {
    console.log(message);
  }
}

function inferSedeIdFromSessionKey(sessionKey: string): number | null {
  const match = String(sessionKey || '').match(/^sede-(\d+)-/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProviderStatus(status: unknown): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'open' || normalized === 'connected') return 'connected';
  if (normalized === 'connecting') return 'initializing';
  if (normalized === 'close' || normalized === 'disconnected') return 'disconnected';
  return normalized || 'unknown';
}

function normalizeWhatsappNumber(value: unknown): string | null {
  const digits = String(value || '').replace(/@.+$/i, '').replace(/[^\d]/g, '').trim();
  return digits || null;
}

function groupDuplicateConnectedOwners(instances: any[]) {
  const groups = new Map<string, any[]>();

  for (const instance of instances) {
    const owner = String(instance.ownerJid || '').trim();
    if (!owner || !instance.connected) continue;
    const list = groups.get(owner) || [];
    list.push(instance);
    groups.set(owner, list);
  }

  return Array.from(groups.entries())
    .filter(([, list]) => list.length > 1)
    .map(([ownerJid, list]) => ({
      ownerJid,
      count: list.length,
      instances: list.map((item) => ({
        name: item.name,
        connectionStatus: item.connectionStatus,
        sede_id_inferida: inferSedeIdFromSessionKey(item.name)
      }))
    }));
}

export const auditarSesionesEvolution = async (req: AuthRequest, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const isSystemAudit = Boolean(req.user?.es_superadmin);
    const sedeId = req.user?.sede_id;

    if (!isSystemAudit && !sedeId) {
      return res.status(400).json({
        ok: false,
        message: 'Sede no encontrada en el token'
      });
    }

    const [dbRows]: any = isSystemAudit
      ? await pool.query(
          `SELECT id, sede_id, nombre_dispositivo, numero_whatsapp, session_key, estado, activo, ultima_conexion, created_at
           FROM whatsapp_sesiones
           ORDER BY sede_id ASC, created_at DESC, id DESC`
        )
      : await pool.query(
          `SELECT id, sede_id, nombre_dispositivo, numero_whatsapp, session_key, estado, activo, ultima_conexion, created_at
           FROM whatsapp_sesiones
           WHERE sede_id = ?
           ORDER BY created_at DESC, id DESC`,
          [sedeId]
        );

    const dbSessions = await Promise.all(
      (dbRows || []).map(async (row: any) => {
        const estado_real = await whatsappService.resolveStatus(row.session_key, row.estado);
        return {
          id: row.id,
          sede_id: row.sede_id,
          nombre_dispositivo: row.nombre_dispositivo,
          numero_whatsapp: row.numero_whatsapp,
          session_key: row.session_key,
          estado_bd: row.estado,
          estado_real,
          connected: estado_real === 'connected',
          activo: Number(row.activo || 0) === 1,
          ultima_conexion: row.ultima_conexion,
          created_at: row.created_at
        };
      })
    );

    const dbKeys = new Set(dbSessions.map((row) => String(row.session_key)));
    const providerInstancesRaw = await whatsappService.listProviderInstances();
    const providerInstances = providerInstancesRaw
      .map((instance) => ({
        ...instance,
        estado_normalizado: normalizeProviderStatus(instance.connectionStatus),
        sede_id_inferida: inferSedeIdFromSessionKey(instance.name)
      }))
      .filter((instance) => {
        if (isSystemAudit) return true;
        return instance.sede_id_inferida === sedeId || dbKeys.has(instance.name);
      });

    const providerKeys = new Set(providerInstances.map((item) => item.name));
    const providerByName = new Map(providerInstances.map((item) => [item.name, item]));

    const orphanProviderInstances = providerInstances.filter((item) => !dbKeys.has(item.name));
    const missingProviderInstances = dbSessions.filter((item) => !providerKeys.has(item.session_key));
    const statusMismatches = dbSessions
      .map((item) => {
        const provider = providerByName.get(item.session_key);
        if (!provider) return null;
        const providerStatus = provider.estado_normalizado;
        return providerStatus !== item.estado_real
          ? {
              session_key: item.session_key,
              sede_id: item.sede_id,
              estado_bd: item.estado_bd,
              estado_real: item.estado_real,
              estado_evolution: providerStatus
            }
          : null;
      })
      .filter(Boolean);

    return res.json({
      ok: true,
      scope: isSystemAudit ? 'system' : 'sede',
      sede_id: isSystemAudit ? null : sedeId,
      summary: {
        bd_total: dbSessions.length,
        bd_connected: dbSessions.filter((item) => item.connected).length,
        evolution_total: providerInstances.length,
        evolution_connected: providerInstances.filter((item) => item.connected).length,
        orphan_evolution: orphanProviderInstances.length,
        missing_in_evolution: missingProviderInstances.length,
        status_mismatches: statusMismatches.length,
        duplicate_connected_numbers: groupDuplicateConnectedOwners(providerInstances).length
      },
      database_sessions: dbSessions,
      evolution_instances: providerInstances,
      reconciliation: {
        orphan_provider_instances: orphanProviderInstances,
        missing_provider_instances: missingProviderInstances,
        status_mismatches: statusMismatches,
        duplicate_connected_numbers: groupDuplicateConnectedOwners(providerInstances)
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al auditar sesiones de WhatsApp contra Evolution',
      error: error.message
    });
  }
};

export const listarSesionesWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const sede_id = req.user?.sede_id;

    if (!sede_id) {
      return res.status(400).json({
        ok: false,
        message: 'Sede no encontrada en el token'
      });
    }

    const [rows]: any = await pool.query(
      `SELECT
         id,
         nombre_dispositivo,
         numero_whatsapp,
         estado,
         activo,
         session_key,
         ultima_conexion,
         created_at
       FROM whatsapp_sesiones
       WHERE sede_id = ?
       ORDER BY created_at DESC, id DESC`,
      [sede_id]
    );

    const sessionsWithRuntimeStatus = await Promise.all(
      (rows || []).map(async (row: any) => {
        const estado_real = await whatsappService.resolveStatus(row.session_key, row.estado);
        return {
          ...row,
          estado_real,
          connected: estado_real === 'connected'
        };
      })
    );

    await Promise.all(
      sessionsWithRuntimeStatus
        .filter((row) => String(row.estado_real || '') !== String(row.estado || ''))
        .map((row) =>
          pool.query(
            `UPDATE whatsapp_sesiones
             SET estado = ?
             WHERE id = ? AND sede_id = ?`,
            [row.estado_real, row.id, sede_id]
          )
        )
    );

    return res.json({
      ok: true,
      data: sessionsWithRuntimeStatus
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al listar sesiones de WhatsApp',
      error: error.message
    });
  }
};

export const crearSesionWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const sede_id = req.user?.sede_id;
    const { nombre_dispositivo, numero_whatsapp } = req.body || {};

    if (!sede_id) {
      return res.status(400).json({
        ok: false,
        message: 'Sede no encontrada en el token'
      });
    }

    if (!String(nombre_dispositivo || '').trim()) {
      return res.status(400).json({
        ok: false,
        message: 'El nombre del dispositivo es obligatorio'
      });
    }

    const nombre = String(nombre_dispositivo).trim();
    const numero = String(numero_whatsapp || '').trim() || null;
    const sessionKey = buildSessionKey(sede_id, nombre);
    const sesionExistente = await obtenerSesionPorSede(sede_id);

    if (sesionExistente) {
      // BullMQ reintentará o fallará si borramos la sesión, no necesitamos borrar trabajos manuales.

      await whatsappService.removeSessionData(sesionExistente.session_key);
      await pool.query(
        `DELETE FROM whatsapp_sesiones
         WHERE id = ? AND sede_id = ?`,
        [sesionExistente.id, sede_id]
      );
    }

    const [result]: any = await pool.query(
      `INSERT INTO whatsapp_sesiones
       (sede_id, nombre_dispositivo, numero_whatsapp, estado, session_key, activo)
       VALUES (?, ?, ?, 'disconnected', ?, 1)`,
      [sede_id, nombre, numero, sessionKey]
    );

    return res.status(201).json({
      ok: true,
      message: sesionExistente
        ? 'La sesion de WhatsApp anterior fue reemplazada correctamente'
        : 'Sesion creada correctamente',
      data: {
        id: result.insertId,
        nombre_dispositivo: nombre,
        numero_whatsapp: numero,
        estado: 'disconnected',
        activo: 1,
        session_key: sessionKey,
        replaced_previous: Boolean(sesionExistente)
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al crear sesion de WhatsApp',
      error: error.message
    });
  }
};

export const iniciarSesionWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const sede_id = req.user?.sede_id;
    const { id } = req.params;
    const sesion = await obtenerSesionPorId(id, sede_id);

    if (!sesion) {
      return res.status(404).json({
        ok: false,
        message: 'Sesion no encontrada'
      });
    }

    await whatsappService.init(sesion.session_key);
    await pool.query(
      `UPDATE whatsapp_sesiones
       SET activo = 1
       WHERE id = ? AND sede_id = ?`,
      [id, sede_id]
    );

    return res.json({
      ok: true,
      message: 'Inicializacion de sesion iniciada'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al iniciar sesion de WhatsApp',
      error: error.message
    });
  }
};

export const obtenerEstadoSesionWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const sede_id = req.user?.sede_id;
    const { id } = req.params;
    const sesion = await obtenerSesionPorId(id, sede_id);

    if (!sesion) {
      return res.status(404).json({
        ok: false,
        message: 'Sesion no encontrada'
      });
    }

    const status = await whatsappService.resolveStatus(sesion.session_key, sesion.estado);

    return res.json({
      ok: true,
      status
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al obtener estado de sesion',
      error: error.message
    });
  }
};

export const obtenerQrSesionWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const sede_id = req.user?.sede_id;
    const { id } = req.params;
    const sesion = await obtenerSesionPorId(id, sede_id);

    if (!sesion) {
      return res.status(404).json({
        ok: false,
        message: 'Sesion no encontrada'
      });
    }

    const status = await whatsappService.resolveStatus(sesion.session_key, sesion.estado);
    if (status === 'connected') {
      return res.json({
        ok: true,
        connected: true,
        qr: null,
        message: 'La sesion ya esta conectada y no requiere QR'
      });
    }

    const qr = await whatsappService.getQr(sesion.session_key);

    return res.json({
      ok: true,
      qr
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al obtener QR de sesion',
      error: error.message
    });
  }
};

export const reconectarSesionWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const sede_id = req.user?.sede_id;
    const { id } = req.params;
    const sesion = await obtenerSesionPorId(id, sede_id);

    if (!sesion) {
      return res.status(404).json({
        ok: false,
        message: 'Sesion no encontrada'
      });
    }

    await whatsappService.reconnect(sesion.session_key);
    await pool.query(
      `UPDATE whatsapp_sesiones
       SET activo = 1
       WHERE id = ? AND sede_id = ?`,
      [id, sede_id]
    );

    return res.json({
      ok: true,
      message: 'Reconexion iniciada'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al reconectar sesion',
      error: error.message
    });
  }
};

export const cerrarSesionWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const sede_id = req.user?.sede_id;
    const { id } = req.params;
    const sesion = await obtenerSesionPorId(id, sede_id);

    if (!sesion) {
      return res.status(404).json({
        ok: false,
        message: 'Sesion no encontrada'
      });
    }

    await whatsappService.logout(sesion.session_key);
    await pool.query(
      `UPDATE whatsapp_sesiones
       SET activo = 0,
           estado = 'disconnected'
       WHERE id = ? AND sede_id = ?`,
      [id, sede_id]
    );

    return res.json({
      ok: true,
      message: 'Sesion cerrada correctamente'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al cerrar sesion',
      error: error.message
    });
  }
};

export const eliminarSesionWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const sede_id = req.user?.sede_id;
    const { id } = req.params;
    const sesion = await obtenerSesionPorId(id, sede_id);

    if (!sesion) {
      return res.status(404).json({
        ok: false,
        message: 'Sesion no encontrada'
      });
    }

    await whatsappService.removeSessionData(sesion.session_key);

    // Ya no borramos de whatsapp_jobs
    await pool.query(
      `DELETE FROM whatsapp_sesiones
       WHERE id = ? AND sede_id = ?`,
      [id, sede_id]
    );

    return res.json({
      ok: true,
      message: `Sesion "${sesion.nombre_dispositivo}" eliminada correctamente`
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar sesion',
      error: error.message
    });
  }
};

export const recibirWebhookEvolution = async (req: Request, res: Response) => {
  try {
    const { event, instance, data, apikey } = req.body || {};
    const state = String(data?.state || data?.status || '').trim().toLowerCase();
    const statusReason = data?.statusReason ?? null;

    // 1. Validar la clave API por seguridad
    const configApiKey = (process.env.EVOLUTION_API_APIKEY || '').trim();
    if (!configApiKey) {
      console.warn(`[Evolution Webhook] EVOLUTION_API_APIKEY no está configurado en backend/.env. Por seguridad se rechaza la petición.`);
      return res.status(500).json({ ok: false, message: 'Internal Server Configuration Error' });
    }
    if (apikey !== configApiKey) {
      console.warn(`[Evolution Webhook] Intento de acceso no autorizado con apikey inválida.`);
      return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }

    logEvolutionWebhook(
      `[Evolution Webhook] event=${event || '-'} instance=${instance || '-'} state=${state || '-'} reason=${statusReason ?? '-'}`
    );

    // 2. Procesar el estado de la conexión
    if (event === 'connection.update') {
      if (!instance) {
        return res.status(400).json({ ok: false, message: 'Missing instance' });
      }

      const mappedStatus = mapEvolutionConnectionState(state);
      if (!mappedStatus) {
        logEvolutionWebhook(`[Evolution Webhook] Estado no reconocido "${state}". Se confirma sin cambiar BD.`);
        return res.json({ ok: true });
      }
      const connectedNumber = normalizeWhatsappNumber(data?.wuid || data?.ownerJid || req.body?.sender);
      const [sessionRows]: any = await pool.query(
        `SELECT id, estado, ultima_conexion, numero_whatsapp
         FROM whatsapp_sesiones
         WHERE session_key = ?
         LIMIT 1`,
        [instance]
      );

      const session = sessionRows[0];
      if (!session) {
        console.warn(`[Evolution Webhook] Instancia "${instance}" no existe en whatsapp_sesiones. Se omite.`);
        return res.json({ ok: true });
      }

      const currentStatus = String(session.estado || 'disconnected').toLowerCase();
      const closeGraceMs = envNumber('EVOLUTION_WEBHOOK_CLOSE_GRACE_MS', 8000);
      const connectingGraceMs = envNumber('EVOLUTION_WEBHOOK_CONNECTING_GRACE_MS', 12000);
      const confirmClose = envBoolean('EVOLUTION_WEBHOOK_CONFIRM_CLOSE', true);

      if (mappedStatus === 'connected') {
        await syncWhatsappSessionStatus(instance, 'connected', true);
        if (connectedNumber && connectedNumber !== session.numero_whatsapp) {
          await pool.query(
            `UPDATE whatsapp_sesiones
             SET numero_whatsapp = ?
             WHERE id = ?`,
            [connectedNumber, session.id]
          );
        }
        logEvolutionWebhook(`[Evolution Webhook] "${instance}" confirmado como connected.`);
        return res.json({ ok: true });
      }

      if (mappedStatus === 'initializing') {
        if (currentStatus === 'connected' || wasRecentlyConnected(session, connectingGraceMs)) {
          logEvolutionWebhook(`[Evolution Webhook] Ignorando "connecting" transitorio para "${instance}".`);
          return res.json({ ok: true });
        }

        await syncWhatsappSessionStatus(instance, 'initializing');
        logEvolutionWebhook(`[Evolution Webhook] "${instance}" actualizado a initializing.`);
        return res.json({ ok: true });
      }

      if (mappedStatus === 'disconnected') {
        if (
          ['connected', 'initializing'].includes(currentStatus)
          && wasRecentlyConnected(session, closeGraceMs)
        ) {
          logEvolutionWebhook(`[Evolution Webhook] Ignorando cierre transitorio reason=${statusReason ?? '-'} para "${instance}".`);
          return res.json({ ok: true });
        }

        if (confirmClose) {
          const confirmedStatus = await whatsappService.resolveStatus(instance, currentStatus);

          if (confirmedStatus === 'connected') {
            await syncWhatsappSessionStatus(instance, 'connected', true);
            logEvolutionWebhook(`[Evolution Webhook] Cierre descartado: Evolution confirma "${instance}" conectado.`);
            return res.json({ ok: true });
          }

          if (confirmedStatus && confirmedStatus !== 'disconnected') {
            await syncWhatsappSessionStatus(instance, confirmedStatus);
            logEvolutionWebhook(`[Evolution Webhook] Cierre confirmado como "${confirmedStatus}" para "${instance}".`);
            return res.json({ ok: true });
          }
        }

        await syncWhatsappSessionStatus(instance, 'disconnected');
        logEvolutionWebhook(`[Evolution Webhook] "${instance}" actualizado a disconnected.`);
      }
    }

    return res.json({ ok: true });
  } catch (error: any) {
    console.error('[Evolution Webhook] Error procesando webhook:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
