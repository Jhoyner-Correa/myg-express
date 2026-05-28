import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis.config';
import { pool } from '../config/database';
import { WhatsappJobData, QUEUE_NAME } from '../queues/whatsapp.queue';
import whatsappService from '../services/whatsapp/whatsappService';
import whatsappMediaStorage from '../services/whatsapp/media/whatsappMediaStorage';
import path from 'path';

/**
 * Worker profesional para el envío de mensajes de WhatsApp.
 *
 * Características:
 * - Auto-reconecta la sesión de WhatsApp si el servidor se reinició y
 *   la sesión no está en memoria (pero sí en BD como activa).
 * - Reintentos automáticos: 3 intentos con backoff exponencial.
 * - Rate limiting: máximo 20 mensajes por minuto.
 * - Logs detallados para debugging.
 */
export const whatsappWorker = new Worker<WhatsappJobData>(
  QUEUE_NAME,
  async (job: Job<WhatsappJobData>) => {
    const { avisoId, loteId, sedeId, telefono, nombre, codigo, sesionId, plantillaId } = job.data;

    console.log(`[BullMQ] Procesando job ${job.id} → aviso ${avisoId} para ${telefono}`);

    // 1. Marcar el aviso como "en proceso"
    const [updateResult]: any = await pool.query(
      `UPDATE avisos_diarios
       SET estado_aviso = 'en_cola', intentos = COALESCE(intentos, 0) + 1, id_trabajo_cola = ?
       WHERE id = ?`,
      [job.id, avisoId]
    );

    if (updateResult.affectedRows === 0) {
      console.warn(`[BullMQ] El aviso ${avisoId} ya no existe en la base de datos (pudo ser eliminado). Omitiendo envío.`);
      return { success: false, reason: 'aviso_deleted' };
    }

    try {
      // 2. Obtener la sesión de la BD (sin filtrar por estado, para poder reconectar)
      const [sesiones]: any = await pool.query(
        `SELECT session_key, estado, activo FROM whatsapp_sesiones WHERE id = ?`,
        [sesionId]
      );

      if (!sesiones.length) {
        throw new Error(`Sesión de WhatsApp con id=${sesionId} no encontrada en la base de datos`);
      }

      const sesion = sesiones[0];

      if (!sesion.activo) {
        throw new Error('La sesión de WhatsApp está desactivada. Actívala desde el panel.');
      }

      const sessionKey = sesion.session_key;

      // 3. Verificar si la sesión está conectada en memoria; si no, reconectar.
      const conectado = await whatsappService.isConnected(sessionKey);

      if (!conectado) {
        console.log(`[BullMQ] Sesión ${sessionKey} no está en memoria. Intentando reconectar...`);
        // Intentar inicializar la sesión (usa las credenciales guardadas en disco)
        try {
          await whatsappService.init(sessionKey);
          // Dar tiempo a WhatsApp para establecer la conexión
          await new Promise((resolve) => setTimeout(resolve, 8000));
        } catch (initError: any) {
          throw new Error(`No se pudo reconectar la sesión WhatsApp: ${initError.message}`);
        }

        // Verificar de nuevo tras la reconexión
        const reconectado = await whatsappService.isConnected(sessionKey);
        if (!reconectado) {
          throw new Error(
            'La sesión de WhatsApp no está conectada. Por favor reconecta tu teléfono desde el panel de WhatsApp.'
          );
        }
      }

      // 4. Obtener la plantilla
      if (!plantillaId) {
        throw new Error('No se asignó ninguna plantilla a este aviso. Selecciona una plantilla antes de enviar.');
      }

      const [plantillas]: any = await pool.query(
        `SELECT contenido, imagen_path FROM plantillas WHERE id = ?`,
        [plantillaId]
      );

      if (!plantillas.length) {
        throw new Error(`Plantilla con id=${plantillaId} no encontrada`);
      }

      const plantilla = plantillas[0];

      // 5. Reemplazar variables en el mensaje
      let mensaje = String(plantilla.contenido || '');
      mensaje = mensaje.replace(/\{nombre\}/g, nombre || '');
      mensaje = mensaje.replace(/\{codigo_paquete\}/g, codigo || '');

      // 6. Resolver ruta de imagen si existe
      let mediaPath: string | undefined;
      let mediaMimeType: string | undefined;
      let mediaFilename: string | undefined;

      if (plantilla.imagen_path) {
        // resolveAbsolutePath soporta tanto rutas relativas nuevas
        // como rutas absolutas legadas guardadas en versiones anteriores
        mediaPath     = whatsappMediaStorage.resolveAbsolutePath(plantilla.imagen_path);
        mediaMimeType = whatsappMediaStorage.mimeTypeFromPath(plantilla.imagen_path);
        mediaFilename = path.basename(plantilla.imagen_path);
      }

      // 7. Enviar el mensaje
      const result = await whatsappService.sendMessage(
        sessionKey,
        telefono,
        mensaje,
        mediaPath,
        mediaMimeType,
        mediaFilename
      );

      const messageId = result?.id?._serialized || result?.id || result?.messageId || 'ok';

      // 8. ✅ Éxito: actualizar BD
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

      // 9. Guardar en log de auditoría
      try {
        // Validar existencia de entidades asociadas para evitar errores de clave foránea
        const [lotes]: any = await pool.query('SELECT id FROM lotes_carga WHERE id = ?', [loteId]);
        const actualLoteId = lotes.length ? loteId : null;

        const [sesiones]: any = await pool.query('SELECT id FROM whatsapp_sesiones WHERE id = ?', [sesionId]);
        const actualSessionId = sesiones.length ? sesionId : null;

        const [avisos]: any = await pool.query('SELECT id FROM avisos_diarios WHERE id = ?', [avisoId]);
        const actualAvisoId = avisos.length ? avisoId : null;

        await pool.query(
          `INSERT INTO mensajes_log
           (sede_id, lote_id, aviso_id, whatsapp_sesion_id, telefono, nombre_destinatario, estado_envio, whatsapp_message_id, fecha_envio)
           VALUES (?, ?, ?, ?, ?, ?, 'enviado', ?, NOW())`,
          [sedeId, actualLoteId, actualAvisoId, actualSessionId, telefono, nombre, messageId]
        );
      } catch (logError: any) {
        // No fallar el job por un error de log
        console.warn(`[BullMQ] No se pudo guardar log para aviso ${avisoId}:`, logError.message);
      }

      console.log(`[BullMQ] ✅ Mensaje enviado correctamente → aviso ${avisoId} a ${telefono}`);
      return { success: true, messageId };

    } catch (error: any) {
      // 10. ❌ Fallo: clasificar el error
      const errorMessage = String(error?.message || 'Error desconocido').substring(0, 500);
      const esSinWhatsapp = errorMessage.toLowerCase().includes('not registered')
        || errorMessage.toLowerCase().includes('no tiene una cuenta')
        || errorMessage.includes('"exists":false')
        || errorMessage.includes('exists: false')
        || errorMessage.toLowerCase().includes('exists:false');

      // Si es el último intento, marcar como fallido definitivo
      const esUltimoIntento = job.attemptsMade >= (job.opts?.attempts ?? 3) - 1;
      const estadoFinal = esUltimoIntento
        ? (esSinWhatsapp ? 'sin_whatsapp' : 'fallido')
        : 'pendiente'; // BullMQ reintentará y volverá a 'en_cola'

      console.error(`[BullMQ] ❌ Fallo en aviso ${avisoId} (intento ${job.attemptsMade + 1}): ${errorMessage}`);

      await pool.query(
        `UPDATE avisos_diarios
         SET estado_aviso = ?, error_detalle = ?
         WHERE id = ?`,
        [estadoFinal, errorMessage, avisoId]
      );

      // Guardar en log solo si es el error final
      if (esUltimoIntento) {
        try {
          // Validar existencia de entidades asociadas para evitar errores de clave foránea
          const [lotes]: any = await pool.query('SELECT id FROM lotes_carga WHERE id = ?', [loteId]);
          const actualLoteId = lotes.length ? loteId : null;

          const [sesiones]: any = await pool.query('SELECT id FROM whatsapp_sesiones WHERE id = ?', [sesionId]);
          const actualSessionId = sesiones.length ? sesionId : null;

          const [avisos]: any = await pool.query('SELECT id FROM avisos_diarios WHERE id = ?', [avisoId]);
          const actualAvisoId = avisos.length ? avisoId : null;

          await pool.query(
            `INSERT INTO mensajes_log
             (sede_id, lote_id, aviso_id, whatsapp_sesion_id, telefono, nombre_destinatario, estado_envio, error_detalle, fecha_envio)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [sedeId, actualLoteId, actualAvisoId, actualSessionId, telefono, nombre, estadoFinal, errorMessage]
          );
        } catch (logError: any) {
          console.warn(`[BullMQ] No se pudo guardar log de error para aviso ${avisoId}:`, logError.message);
        }
      }

      // Relanzar para que BullMQ maneje el reintento
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2, // 2 mensajes en paralelo (más seguro para WhatsApp)
    limiter: {
      max: 15,        // máximo 15 mensajes
      duration: 60000 // por minuto
    }
  }
);

whatsappWorker.on('failed', (job, err) => {
  console.error(`[BullMQ] ❌ Job fallido ${job?.id}: ${err.message}`);
});

whatsappWorker.on('completed', (job) => {
  console.log(`[BullMQ] ✅ Job completado ${job.id}`);
});

whatsappWorker.on('error', (err) => {
  console.error('[BullMQ] Error en el worker:', err.message);
});
