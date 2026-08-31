import { Job, Worker } from 'bullmq';
import { redisConnection } from '../core/config/redis.config';
import { pool } from '../core/database/database';
import { QUEUE_NAME, waQueue, WhatsappJobData } from '../queues/whatsapp.queue';
import whatsappService from '../services/whatsapp/whatsappService';
import whatsappMediaStorage from '../services/whatsapp/media/whatsappMediaStorage';
import path from 'path';

const lastSendAtBySession = new Map<string, number>();

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const minSendIntervalMs = Math.max(1000, envNumber('WHATSAPP_INTER_MESSAGE_DELAY_MS', 25000));
const workerConcurrency = Math.max(1, envNumber('WHATSAPP_WORKER_CONCURRENCY', 1));
const rateLimitMax = Math.max(1, envNumber('WHATSAPP_RATE_LIMIT_MAX', 2));
const rateLimitDurationMs = Math.max(1000, envNumber('WHATSAPP_RATE_LIMIT_DURATION_MS', 60000));
const adaptiveAfterMessages = Math.max(1, envNumber('WHATSAPP_ADAPTIVE_AFTER_MESSAGES', 30));
const adaptiveExtraDelayMs = Math.max(0, envNumber('WHATSAPP_ADAPTIVE_EXTRA_DELAY_MS', 60000));
const adaptiveStrongAfterMessages = Math.max(adaptiveAfterMessages, envNumber('WHATSAPP_ADAPTIVE_STRONG_AFTER_MESSAGES', 50));
const adaptiveStrongDelayMs = Math.max(0, envNumber('WHATSAPP_ADAPTIVE_STRONG_DELAY_MS', 240000));
const hourlyHardLimit = Math.max(1, envNumber('WHATSAPP_HOURLY_HARD_LIMIT', 45));
const hourlyHardCooldownMs = Math.max(60000, envNumber('WHATSAPP_HOURLY_HARD_COOLDOWN_MS', 1800000));
const mediaTextOnlyAfterMessages = Math.max(0, envNumber('WHATSAPP_MEDIA_TEXT_ONLY_AFTER_MESSAGES', 35));
const mediaStrategy = String(process.env.WHATSAPP_MEDIA_STRATEGY || 'text_after_threshold').toLowerCase();

function isWhatsappConnectionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('no esta conectada')
    || normalized.includes('no está conectada')
    || normalized.includes('not connected')
    || normalized.includes('disconnected')
    || normalized.includes('connection closed')
    || normalized.includes('socket closed')
    || normalized.includes('timed out')
    || normalized.includes('timeout')
    || normalized.includes('reconecta tu telefono')
    || normalized.includes('reconecta tu teléfono');
}

function isWhatsappSafetyPauseError(message: string): boolean {
  const normalized = message.toLowerCase();
  return isWhatsappConnectionError(message)
    || normalized.includes('blocked')
    || normalized.includes('bloque')
    || normalized.includes('rate limit')
    || normalized.includes('too many requests')
    || normalized.includes('status":429')
    || normalized.includes('status 429')
    || normalized.includes(' 429')
    || normalized.includes('status":403')
    || normalized.includes('status 403')
    || normalized.includes(' 403')
    || normalized.includes('status":440')
    || normalized.includes('status 440')
    || normalized.includes('status":428')
    || normalized.includes('status 428')
    || normalized.includes('connection replaced')
    || normalized.includes('logged out')
    || normalized.includes('forbidden')
    || normalized.includes('unauthorized');
}

function isSinWhatsappError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('not registered')
    || normalized.includes('no tiene una cuenta')
    || normalized.includes('"exists":false')
    || normalized.includes('exists: false')
    || normalized.includes('exists:false');
}

async function waitForSessionPace(sessionKey: string, avisoId: number): Promise<void> {
  const lastSendAt = lastSendAtBySession.get(sessionKey) || 0;
  const elapsed = Date.now() - lastSendAt;
  const waitMs = Math.max(0, minSendIntervalMs - elapsed);

  if (waitMs > 0) {
    console.log(`[BullMQ] Esperando ${waitMs}ms antes de enviar aviso ${avisoId}.`);
    await sleep(waitMs);
  }
}

async function getSessionTrafficStats(sesionId: number): Promise<{ lastHour: number; today: number }> {
  const [[stats]]: any = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1 ELSE 0 END), 0) AS lastHour,
       COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today
     FROM mensajes_log
     WHERE whatsapp_sesion_id = ?
       AND estado_envio = 'enviado'`,
    [sesionId]
  );

  return {
    lastHour: Number(stats?.lastHour || 0),
    today: Number(stats?.today || 0)
  };
}

function shouldSendMedia(stats: { today: number }, hasMedia: boolean): boolean {
  if (!hasMedia) return false;
  if (mediaStrategy === 'always') return true;
  if (mediaStrategy === 'text_only') return false;
  if (mediaStrategy === 'text_after_threshold') {
    return stats.today < mediaTextOnlyAfterMessages;
  }
  return true;
}

async function waitForAdaptiveSafety(sesionId: number, avisoId: number): Promise<void> {
  const stats = await getSessionTrafficStats(sesionId);

  if (stats.lastHour >= hourlyHardLimit) {
    console.warn(`[BullMQ] Sesion ${sesionId} alcanzo ${stats.lastHour} envios en la ultima hora. Enfriando ${hourlyHardCooldownMs}ms antes del aviso ${avisoId}.`);
    await sleep(hourlyHardCooldownMs);
    return;
  }

  if (stats.today >= adaptiveStrongAfterMessages && adaptiveStrongDelayMs > 0) {
    console.log(`[BullMQ] Ritmo fuerte activado para sesion ${sesionId}: ${stats.today} envios hoy. Esperando ${adaptiveStrongDelayMs}ms.`);
    await sleep(adaptiveStrongDelayMs);
    return;
  }

  if (stats.today >= adaptiveAfterMessages && adaptiveExtraDelayMs > 0) {
    console.log(`[BullMQ] Ritmo conservador activado para sesion ${sesionId}: ${stats.today} envios hoy. Esperando ${adaptiveExtraDelayMs}ms.`);
    await sleep(adaptiveExtraDelayMs);
  }
}

async function removeQueuedJobsForLote(loteId: number): Promise<number> {
  const jobs = await waQueue.getJobs(['waiting', 'delayed', 'paused']);
  let removedJobs = 0;

  for (const queuedJob of jobs) {
    if (Number(queuedJob.data?.loteId) === Number(loteId)) {
      await queuedJob.remove();
      removedJobs++;
    }
  }

  return removedJobs;
}

async function pauseLoteForWhatsAppSafety(
  loteId: number,
  sedeId: number,
  reason: string
): Promise<number> {
  const removedJobs = await removeQueuedJobsForLote(loteId);

  await pool.query(
    `UPDATE avisos_diarios
     SET estado_aviso = 'pendiente',
         error_detalle = ?
     WHERE lote_id = ?
       AND sede_id = ?
       AND estado_aviso IN ('pendiente', 'en_cola')`,
    [reason, loteId, sedeId]
  );

  await pool.query(
    `UPDATE lotes_carga
     SET estado = 'pausado'
     WHERE id = ? AND sede_id = ?`,
    [loteId, sedeId]
  );

  return removedJobs;
}

async function refreshLoteStatusAfterJob(job?: Job<WhatsappJobData>): Promise<void> {
  if (!job?.data?.loteId || !job?.data?.sedeId) return;

  const loteId = Number(job.data.loteId);
  const sedeId = Number(job.data.sedeId);

  try {
    const [[lote]]: any = await pool.query(
      `SELECT estado
       FROM lotes_carga
       WHERE id = ? AND sede_id = ?
       LIMIT 1`,
      [loteId, sedeId]
    );

    if (!lote || String(lote.estado).toLowerCase() !== 'procesando') return;

    const [[stats]]: any = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN estado_aviso = 'pendiente' THEN 1 ELSE 0 END), 0) AS pendientes,
         COALESCE(SUM(CASE WHEN estado_aviso = 'en_cola' THEN 1 ELSE 0 END), 0) AS en_cola,
         COALESCE(SUM(CASE WHEN estado_aviso = 'fallido' THEN 1 ELSE 0 END), 0) AS fallidos
       FROM avisos_diarios
       WHERE lote_id = ? AND sede_id = ?`,
      [loteId, sedeId]
    );

    const pendientes = Number(stats?.pendientes || 0);
    const enCola = Number(stats?.en_cola || 0);
    const fallidos = Number(stats?.fallidos || 0);

    if (pendientes > 0 || enCola > 0) return;

    const nextStatus = fallidos > 0 ? 'pausado' : 'completado';
    await pool.query(
      `UPDATE lotes_carga
       SET estado = ?
       WHERE id = ? AND sede_id = ? AND estado = 'procesando'`,
      [nextStatus, loteId, sedeId]
    );

    console.log(`[BullMQ] Lote ${loteId} actualizado a ${nextStatus}.`);
  } catch (error: any) {
    console.warn(`[BullMQ] No se pudo actualizar estado final del lote ${loteId}:`, error.message);
  }
}

async function guardarLogEnvio(params: {
  sedeId: number;
  loteId: number;
  avisoId: number;
  sesionId: number;
  telefono: string;
  nombre: string | null;
  estado: 'enviado' | 'enviado_manual' | 'fallido' | 'sin_whatsapp' | 'cancelado';
  whatsappMessageId?: string | null;
  errorDetalle?: string | null;
}) {
  try {
    const [lotes]: any = await pool.query('SELECT id FROM lotes_carga WHERE id = ?', [params.loteId]);
    const [sesiones]: any = await pool.query('SELECT id FROM whatsapp_sesiones WHERE id = ?', [params.sesionId]);
    const [avisos]: any = await pool.query('SELECT id FROM avisos_diarios WHERE id = ?', [params.avisoId]);

    await pool.query(
      `INSERT INTO mensajes_log
       (sede_id, lote_id, aviso_id, whatsapp_sesion_id, telefono, nombre_destinatario, estado_envio, whatsapp_message_id, error_detalle, fecha_envio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         whatsapp_message_id = VALUES(whatsapp_message_id),
         error_detalle = VALUES(error_detalle),
         fecha_envio = VALUES(fecha_envio)`,
      [
        params.sedeId,
        lotes.length ? params.loteId : null,
        avisos.length ? params.avisoId : null,
        sesiones.length ? params.sesionId : null,
        params.telefono,
        params.nombre,
        params.estado,
        params.whatsappMessageId || null,
        params.errorDetalle || null
      ]
    );
  } catch (logError: any) {
    console.warn(`[BullMQ] No se pudo guardar log para aviso ${params.avisoId}:`, logError.message);
  }
}

export const whatsappWorker = new Worker<WhatsappJobData>(
  QUEUE_NAME,
  async (job: Job<WhatsappJobData>) => {
    const { avisoId, loteId, sedeId, telefono, nombre, codigo, sesionId, plantillaId, orden } = job.data;

    console.log(`[BullMQ] Procesando job ${job.id} -> lote ${loteId}, orden ${orden || '-'}, aviso ${avisoId}, telefono ${telefono}`);

    try {
      const [sesiones]: any = await pool.query(
        `SELECT session_key, activo FROM whatsapp_sesiones WHERE id = ?`,
        [sesionId]
      );

      if (!sesiones.length) {
        throw new Error(`Sesion de WhatsApp con id=${sesionId} no encontrada`);
      }

      const sesion = sesiones[0];
      if (!sesion.activo) {
        throw new Error('La sesion de WhatsApp esta desactivada. Activala desde el panel.');
      }

      const sessionKey = sesion.session_key;
      const conectado = await whatsappService.isConnected(sessionKey);

      if (!conectado) {
        const pauseReason = 'Envio pausado: WhatsApp no esta conectado. El usuario debe decidir si retoma, marca manualmente o cancela pendientes.';
        const removedJobs = await pauseLoteForWhatsAppSafety(Number(loteId), Number(sedeId), pauseReason);
        console.warn(`[BullMQ] Lote ${loteId} pausado por WhatsApp desconectado. Trabajos pendientes removidos: ${removedJobs}`);
        return { success: false, paused: true, reason: 'whatsapp_disconnected', removedJobs };
      }

      const [avisos]: any = await pool.query(
        `SELECT nombre, telefono, codigo_paquete, id_plantilla, mensaje_personalizado,
                estado_aviso, id_trabajo_cola
         FROM avisos_diarios
         WHERE id = ? AND lote_id = ? AND sede_id = ?
         LIMIT 1`,
        [avisoId, loteId, sedeId]
      );

      if (!avisos.length) {
        throw new Error(`Aviso ${avisoId} no encontrado antes del envio`);
      }

      const aviso = avisos[0];
      if (aviso.estado_aviso !== 'en_cola' || String(aviso.id_trabajo_cola) !== String(job.id)) {
        console.warn(`[BullMQ] Job ${job.id} omitido: ya no es propietario del aviso ${avisoId}.`);
        return { success: false, skipped: true, estado: aviso.estado_aviso };
      }

      const [claimResult]: any = await pool.query(
        `UPDATE avisos_diarios
         SET intentos = COALESCE(intentos, 0) + 1
         WHERE id = ? AND lote_id = ? AND sede_id = ?
           AND estado_aviso = 'en_cola' AND id_trabajo_cola = ?`,
        [avisoId, loteId, sedeId, job.id]
      );
      if (claimResult.affectedRows === 0) {
        return { success: false, skipped: true, estado: 'dispatch_replaced' };
      }
      const actualNombre = aviso.nombre ?? nombre;
      const actualTelefono = aviso.telefono ?? telefono;
      const actualCodigo = aviso.codigo_paquete ?? codigo;
      const actualPlantillaId = aviso.id_plantilla ?? plantillaId;

      let plantilla: any = null;
      if (actualPlantillaId) {
        const [plantillas]: any = await pool.query(
          `SELECT contenido, imagen_path FROM plantillas WHERE id = ?`,
          [actualPlantillaId]
        );
        plantilla = plantillas[0] || null;
      }

      if (!plantilla && !aviso.mensaje_personalizado) {
        throw new Error('No se asigno ninguna plantilla ni mensaje personalizado a este aviso.');
      }

      let mensaje = String(aviso.mensaje_personalizado || plantilla?.contenido || '');
      mensaje = mensaje.replace(/\{nombre\}/g, actualNombre || '');
      mensaje = mensaje.replace(/\{codigo_paquete\}/g, actualCodigo || '');

      let mediaPath: string | undefined;
      let mediaMimeType: string | undefined;
      let mediaFilename: string | undefined;

      if (plantilla?.imagen_path) {
        mediaPath = whatsappMediaStorage.resolveAbsolutePath(plantilla.imagen_path);
        mediaMimeType = whatsappMediaStorage.mimeTypeFromPath(plantilla.imagen_path);
        mediaFilename = path.basename(plantilla.imagen_path);
      }

      const trafficStats = await getSessionTrafficStats(Number(sesionId));
      if (!shouldSendMedia(trafficStats, Boolean(mediaPath))) {
        if (mediaPath) {
          console.log(`[BullMQ] Envio sin imagen para aviso ${avisoId}: estrategia=${mediaStrategy}, enviados_hoy=${trafficStats.today}.`);
        }
        mediaPath = undefined;
        mediaMimeType = undefined;
        mediaFilename = undefined;
      }

      await waitForSessionPace(sessionKey, avisoId);
      await waitForAdaptiveSafety(Number(sesionId), avisoId);

      let result: any;
      try {
        result = await whatsappService.sendMessage(
          sessionKey,
          actualTelefono,
          mensaje,
          mediaPath,
          mediaMimeType,
          mediaFilename
        );
      } finally {
        lastSendAtBySession.set(sessionKey, Date.now());
      }

      const messageId = result?.id?._serialized || result?.id || result?.messageId || 'ok';

      await pool.query(
        `UPDATE avisos_diarios
         SET estado_aviso = 'enviado',
             whatsapp_message_id = ?,
             fecha_envio = NOW(),
             error_detalle = NULL,
             whatsapp_sesion_id = ?
         WHERE id = ?`,
        [messageId, sesionId, avisoId]
      );

      await guardarLogEnvio({
        sedeId,
        loteId,
        avisoId,
        sesionId,
        telefono: actualTelefono,
        nombre: actualNombre,
        estado: 'enviado',
        whatsappMessageId: messageId
      });

      console.log(`[BullMQ] Mensaje enviado correctamente -> aviso ${avisoId} a ${actualTelefono}`);
      return { success: true, messageId };
    } catch (error: any) {
      const errorMessage = String(error?.message || 'Error desconocido').substring(0, 500);

      if (isWhatsappSafetyPauseError(errorMessage)) {
        const pauseReason = `Envio pausado por seguridad: ${errorMessage}`;
        const removedJobs = await pauseLoteForWhatsAppSafety(Number(loteId), Number(sedeId), pauseReason);
        console.warn(`[BullMQ] Lote ${loteId} pausado por seguridad WhatsApp. Trabajos pendientes removidos: ${removedJobs}`);
        return { success: false, paused: true, reason: 'whatsapp_safety_pause', removedJobs };
      }

      const esSinWhatsapp = isSinWhatsappError(errorMessage);
      const esUltimoIntento = job.attemptsMade >= (job.opts?.attempts ?? 1) - 1;
      const estadoFinal = esUltimoIntento
        ? (esSinWhatsapp ? 'sin_whatsapp' : 'fallido')
        : 'en_cola';

      console.error(`[BullMQ] Fallo en aviso ${avisoId} (intento ${job.attemptsMade + 1}): ${errorMessage}`);

      await pool.query(
        `UPDATE avisos_diarios
         SET estado_aviso = ?, error_detalle = ?,
             id_trabajo_cola = CASE WHEN ? THEN NULL ELSE id_trabajo_cola END
         WHERE id = ? AND id_trabajo_cola = ?`,
        [estadoFinal, errorMessage, esUltimoIntento ? 1 : 0, avisoId, job.id]
      );

      if (esUltimoIntento) {
        await guardarLogEnvio({
          sedeId,
          loteId,
          avisoId,
          sesionId,
          telefono,
          nombre,
          estado: estadoFinal as 'fallido' | 'sin_whatsapp',
          errorDetalle: errorMessage
        });
      }

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: workerConcurrency,
    limiter: {
      max: rateLimitMax,
      duration: rateLimitDurationMs
    }
  }
);

whatsappWorker.on('failed', (job, err) => {
  console.error(`[BullMQ] Job fallido ${job?.id}: ${err.message}`);
  void refreshLoteStatusAfterJob(job as Job<WhatsappJobData> | undefined);
});

whatsappWorker.on('completed', (job) => {
  console.log(`[BullMQ] Job completado ${job.id}`);
  void refreshLoteStatusAfterJob(job);
});

whatsappWorker.on('error', (err) => {
  console.error('[BullMQ] Error en el worker:', err.message);
});
