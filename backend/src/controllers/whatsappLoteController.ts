import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middlewares/authMiddleware';
import { encolarLote, waQueue } from '../queues/whatsapp.queue';


// Helper function removed because Worker handles variable replacement

export const enviarLoteWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const {
      lote_id,
      whatsapp_sesion_id,
      plantilla_id,
      mensaje_personalizado
    } = req.body;
    const sede_id = req.user?.sede_id;

    if (!sede_id || !lote_id || !whatsapp_sesion_id) {
      return res.status(400).json({
        ok: false,
        message: 'lote_id y whatsapp_sesion_id son obligatorios'
      });
    }

    // Validación de plantilla ya no es estrictamente requerida aquí si se asignó en la importación.
    // Pero si se envía, actualizaremos los avisos.

    const [loteRows]: any = await pool.query(
      `SELECT id, sede_id, estado
       FROM lotes_carga
       WHERE id = ? AND sede_id = ?
       LIMIT 1`,
      [lote_id, sede_id]
    );

    if (!loteRows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Lote no encontrado o no pertenece a tu sede'
      });
    }

    const [sesionRows]: any = await pool.query(
      `SELECT id, sede_id, activo, estado, session_key
       FROM whatsapp_sesiones
       WHERE id = ? AND sede_id = ?
       LIMIT 1`,
      [whatsapp_sesion_id, sede_id]
    );

    if (!sesionRows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Sesion de WhatsApp no encontrada o no pertenece a tu sede'
      });
    }

    const sesion = sesionRows[0];

    if (!sesion.activo) {
      return res.status(400).json({
        ok: false,
        message: 'La sesion de WhatsApp esta inactiva. Actívala desde el panel de WhatsApp.'
      });
    }

    // Nota: No verificamos isConnected() aquí porque la conexión en memoria
    // puede perderse temporalmente al reiniciar el servidor (ts-node-dev).
    // El worker de BullMQ verifica la conexión real antes de enviar cada mensaje
    // y reintenta automáticamente si la sesión no está lista.

    let plantilla: any = { contenido: '', imagen_path: null };

    if (plantilla_id) {
      const [plantillaRows]: any = await pool.query(
        `SELECT id, nombre, contenido, imagen_path, sede_id
         FROM plantillas
         WHERE id = ?
         LIMIT 1`,
        [plantilla_id]
      );

      if (!plantillaRows.length) {
        return res.status(404).json({
          ok: false,
          message: 'Plantilla no encontrada'
        });
      }

      plantilla = plantillaRows[0];

      if (plantilla.sede_id !== null && plantilla.sede_id !== sede_id) {
        return res.status(403).json({
          ok: false,
          message: 'La plantilla no pertenece a tu sede'
        });
      }
    }

    // Actualizar avisos con la plantilla seleccionada si se envió desde el frontend
    if (plantilla_id || mensaje_personalizado) {
      await pool.query(
        `UPDATE avisos_diarios 
         SET id_plantilla = ?, mensaje_personalizado = ? 
         WHERE lote_id = ? AND sede_id = ? AND estado_aviso = 'pendiente'`,
        [plantilla_id || null, mensaje_personalizado || null, lote_id, sede_id]
      );
    }

    const [avisosRows]: any = await pool.query(
      `SELECT *
       FROM avisos_diarios
       WHERE lote_id = ?
         AND sede_id = ?
         AND estado_aviso = 'pendiente'
       ORDER BY id ASC`,
      [lote_id, sede_id]
    );

    if (!avisosRows.length) {
      return res.status(404).json({
        ok: false,
        message: 'No hay avisos pendientes en este lote'
      });
    }

    // Encolar en BullMQ
    await encolarLote(Number(lote_id), avisosRows, Number(whatsapp_sesion_id));

    // Marcar lote como procesando
    await pool.query(`UPDATE lotes_carga SET estado = 'procesando' WHERE id = ?`, [lote_id]);

    return res.json({
      ok: true,
      queued: avisosRows.length,
      skipped: 0,
      message: 'El lote fue enviado a la cola de BullMQ. El worker procesará los mensajes en segundo plano.'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al enviar lote por WhatsApp',
      error: error.message
    });
  }
};

export const reanudarLoteWhatsAppInterrumpido = async (req: AuthRequest, res: Response) => {
  try {
    const { loteId } = req.params;
    const { whatsapp_sesion_id } = req.body;
    const sede_id = req.user?.sede_id;

    if (!sede_id || !loteId || !whatsapp_sesion_id) {
      return res.status(400).json({ ok: false, message: 'loteId y whatsapp_sesion_id son obligatorios' });
    }

    // 1. Validar lote
    const [loteRows]: any = await pool.query(
      `SELECT id FROM lotes_carga WHERE id = ? AND sede_id = ? LIMIT 1`,
      [loteId, sede_id]
    );
    if (!loteRows.length) {
      return res.status(404).json({ ok: false, message: 'Lote no encontrado o no pertenece a tu sede' });
    }

    // 2. Validar sesión
    const [sesionRows]: any = await pool.query(
      `SELECT id, activo FROM whatsapp_sesiones WHERE id = ? AND sede_id = ? LIMIT 1`,
      [whatsapp_sesion_id, sede_id]
    );
    if (!sesionRows.length || !sesionRows[0].activo) {
      return res.status(404).json({ ok: false, message: 'Sesión inactiva o no encontrada' });
    }

    // 3. Limpiar cualquier trabajo residual del lote en la cola actual
    const jobs = await waQueue.getJobs(['waiting', 'delayed', 'paused']);
    let removedJobs = 0;
    for (const job of jobs) {
      if (Number(job.data?.loteId) === Number(loteId)) {
        await job.remove();
        removedJobs++;
      }
    }

    // 4. Obtener todos los avisos del lote con estado 'pendiente' o 'fallido' (para re-intentar)
    const [avisosRows]: any = await pool.query(
      `SELECT * FROM avisos_diarios
       WHERE lote_id = ? AND sede_id = ? AND estado_aviso IN ('pendiente', 'fallido')
       ORDER BY id ASC`,
      [loteId, sede_id]
    );

    if (!avisosRows.length) {
      return res.status(400).json({ ok: false, message: 'No hay mensajes pendientes o fallidos para reanudar' });
    }

    // 5. Cambiar su estado a 'pendiente' y resetear intentos
    await pool.query(
      `UPDATE avisos_diarios
       SET estado_aviso = 'pendiente', intentos = 0, error_detalle = NULL
       WHERE lote_id = ? AND sede_id = ? AND estado_aviso IN ('pendiente', 'fallido')`,
      [loteId, sede_id]
    );

    // 6. Encolar nuevamente en BullMQ
    await encolarLote(Number(loteId), avisosRows, Number(whatsapp_sesion_id));

    // 7. Marcar lote como 'procesando'
    await pool.query(
      `UPDATE lotes_carga SET estado = 'procesando' WHERE id = ?`,
      [loteId]
    );

    return res.json({
      ok: true,
      resumed: avisosRows.length,
      message: `Se reanudó el envío de ${avisosRows.length} mensajes. Se removieron ${removedJobs} de la cola anterior.`
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};

export const marcarLoteWhatsAppManual = async (req: AuthRequest, res: Response) => {
  try {
    const { loteId } = req.params;
    const sede_id = req.user?.sede_id;

    if (!sede_id || !loteId) {
      return res.status(400).json({ ok: false, message: 'loteId es obligatorio' });
    }

    // 1. Validar lote
    const [loteRows]: any = await pool.query(
      `SELECT id FROM lotes_carga WHERE id = ? AND sede_id = ? LIMIT 1`,
      [loteId, sede_id]
    );
    if (!loteRows.length) {
      return res.status(404).json({ ok: false, message: 'Lote no encontrado o no pertenece a tu sede' });
    }

    // 2. Remover de BullMQ
    const jobs = await waQueue.getJobs(['waiting', 'delayed', 'paused']);
    let removedJobs = 0;
    for (const job of jobs) {
      if (Number(job.data?.loteId) === Number(loteId)) {
        await job.remove();
        removedJobs++;
      }
    }

    // 3. Actualizar estado de los avisos a 'enviado'
    const [result]: any = await pool.query(
      `UPDATE avisos_diarios
       SET estado_aviso = 'enviado', error_detalle = 'Marcado como enviado manual por el usuario', fecha_envio = NOW()
       WHERE lote_id = ? AND sede_id = ? AND estado_aviso IN ('pendiente', 'en_cola', 'fallido')`,
      [loteId, sede_id]
    );

    // 4. Marcar lote como 'completado'
    await pool.query(
      `UPDATE lotes_carga SET estado = 'completado' WHERE id = ?`,
      [loteId]
    );

    return res.json({
      ok: true,
      processed: result.affectedRows,
      message: `Se marcaron ${result.affectedRows} mensajes como enviados manualmente y se limpiaron ${removedJobs} trabajos de la cola.`
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};

export const cancelarPendientesLoteWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const { loteId } = req.params;
    const sede_id = req.user?.sede_id;

    if (!sede_id || !loteId) {
      return res.status(400).json({ ok: false, message: 'loteId es obligatorio' });
    }

    // 1. Validar propiedad del lote
    const [loteRows]: any = await pool.query(
      `SELECT id FROM lotes_carga WHERE id = ? AND sede_id = ? LIMIT 1`,
      [loteId, sede_id]
    );
    if (!loteRows.length) {
      return res.status(404).json({ ok: false, message: 'Lote no encontrado o no pertenece a tu sede' });
    }

    // 2. Obtener y remover trabajos de BullMQ
    const jobs = await waQueue.getJobs(['waiting', 'delayed', 'paused']);
    let canceled = 0;
    for (const job of jobs) {
      if (Number(job.data?.loteId) === Number(loteId)) {
        await job.remove();
        canceled++;
      }
    }

    // 3. Actualizar estado de los avisos pendientes a 'cancelado' en base de datos
    const [result]: any = await pool.query(
      `UPDATE avisos_diarios
       SET estado_aviso = 'cancelado', error_detalle = 'Cancelado por el usuario'
       WHERE lote_id = ? AND sede_id = ? AND estado_aviso IN ('pendiente', 'en_cola', 'fallido')`,
      [loteId, sede_id]
    );

    // 4. Marcar lote como 'cancelado'
    await pool.query(
      `UPDATE lotes_carga SET estado = 'cancelado' WHERE id = ?`,
      [loteId]
    );

    return res.json({
      ok: true,
      canceled: result.affectedRows,
      message: `Se cancelaron ${result.affectedRows} mensajes pendientes y se removieron ${canceled} de la cola.`
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};
