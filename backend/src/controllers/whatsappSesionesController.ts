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

async function obtenerSesionPorId(id: string, sedeId: number | undefined) {
  const [rows]: any = await pool.query(
    `SELECT id, sede_id, nombre_dispositivo, numero_whatsapp, session_key, estado, activo, ultima_conexion, created_at
     FROM whatsapp_sesiones
     WHERE id = ? AND sede_id = ?
     LIMIT 1`,
    [id, sedeId]
  );

  return rows[0] || null;
}

async function obtenerSesionPorSede(sedeId: number | undefined) {
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

    try {
      await whatsappService.removeSessionData(sesion.session_key);
    } catch (err) {
      console.warn(`No se pudieron borrar todos los archivos de sesión ${sesion.session_key}. Serán limpiados después.`);
    }
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
    console.log('[Evolution Webhook] Headers:', req.headers);
    console.log('[Evolution Webhook] Body:', req.body);
    const { event, instance, data, apikey } = req.body || {};

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

    console.log(`[Evolution Webhook] Recibido evento: "${event}" para la instancia: "${instance}"`);

    // 2. Procesar el estado de la conexión
    if (event === 'connection.update') {
      const state = String(data?.state || data?.status || '').toLowerCase();
      
      // Mapear estados de Evolution API / Baileys a nuestro sistema
      let estadoInterno = 'disconnected';
      let updateLastConnection = false;

      if (state === 'open' || state === 'connected') {
        estadoInterno = 'connected';
        updateLastConnection = true;
      } else if (state === 'connecting') {
        estadoInterno = 'initializing';
      } else if (state === 'close' || state === 'disconnected') {
        estadoInterno = 'disconnected';
      }

      console.log(`[Evolution Webhook] Mapeando estado "${state}" a "${estadoInterno}" para sessionKey "${instance}"`);

      const query = updateLastConnection
        ? `UPDATE whatsapp_sesiones
           SET estado = ?, ultima_conexion = NOW()
           WHERE session_key = ?`
        : `UPDATE whatsapp_sesiones
           SET estado = ?
           WHERE session_key = ?`;

      await pool.query(query, [estadoInterno, instance]);
    }

    return res.json({ ok: true });
  } catch (error: any) {
    console.error('[Evolution Webhook] Error procesando webhook:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
};
