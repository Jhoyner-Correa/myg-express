import { Response } from 'express';
import { pool } from '../../../core/database/database';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';
import { encolarLote, waQueue } from '../../../queues/whatsapp.queue';
import whatsappService from '../../../services/whatsapp/whatsappService';
import { toWhatsappUserMessage } from '../../../core/utils/whatsappErrorMessages';
import { randomUUID } from 'crypto';


// Helper function removed because Worker handles variable replacement

async function removeQueuedJobsForLote(loteId: number): Promise<number> {
  const jobs = await waQueue.getJobs(['waiting', 'delayed', 'paused']);
  let removedJobs = 0;

  for (const job of jobs) {
    if (Number(job.data?.loteId) === Number(loteId)) {
      await job.remove();
      removedJobs++;
    }
  }

  return removedJobs;
}

async function claimAvisosForDispatch(
  loteId: number,
  sedeId: number,
  includeFailed = false
): Promise<{ dispatchPrefix: string; avisos: any[] }> {
  const dispatchPrefix = `dispatch-${randomUUID()}-aviso-`;
  const eligibleStates = includeFailed ? "('pendiente','fallido')" : "('pendiente')";
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE avisos_diarios
       SET estado_aviso = 'en_cola',
           id_trabajo_cola = CONCAT(?, id),
           error_detalle = NULL,
           intentos = CASE WHEN ? THEN 0 ELSE intentos END
       WHERE lote_id = ? AND sede_id = ?
         AND estado_aviso IN ${eligibleStates}`,
      [dispatchPrefix, includeFailed ? 1 : 0, loteId, sedeId]
    );

    const [avisos]: any = await connection.query(
      `SELECT * FROM avisos_diarios
       WHERE lote_id = ? AND sede_id = ?
         AND estado_aviso = 'en_cola'
         AND id_trabajo_cola LIKE CONCAT(?, '%')
       ORDER BY id ASC`,
      [loteId, sedeId, dispatchPrefix]
    );

    if (avisos.length) {
      await connection.query(
        `UPDATE lotes_carga SET estado = 'procesando' WHERE id = ? AND sede_id = ?`,
        [loteId, sedeId]
      );
    }
    await connection.commit();
    return { dispatchPrefix, avisos };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function releaseFailedDispatch(dispatchPrefix: string): Promise<void> {
  await pool.query(
    `UPDATE avisos_diarios
     SET estado_aviso = 'pendiente', id_trabajo_cola = NULL
     WHERE estado_aviso = 'en_cola'
       AND id_trabajo_cola LIKE CONCAT(?, '%')`,
    [dispatchPrefix]
  );
}

async function getLoteQueueControl(loteId: number, sedeId: number) {
  const [[lote]]: any = await pool.query(
    `SELECT estado
     FROM lotes_carga
     WHERE id = ? AND sede_id = ?
     LIMIT 1`,
    [loteId, sedeId]
  );

  const [[stats]]: any = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN estado_aviso = 'pendiente' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN estado_aviso = 'en_cola' THEN 1 ELSE 0 END) AS en_cola,
       SUM(CASE WHEN estado_aviso = 'fallido' THEN 1 ELSE 0 END) AS failed,
       MAX(CASE WHEN estado_aviso IN ('pendiente', 'en_cola', 'fallido') THEN SUBSTRING(error_detalle, 1, 160) ELSE NULL END) AS last_error
     FROM avisos_diarios
     WHERE lote_id = ? AND sede_id = ?`,
    [loteId, sedeId]
  );

  let routeStatus = String(lote?.estado || '').toLowerCase();
  const pendingCount = Number(stats?.pending || 0);
  const processingCount = Number(stats?.en_cola || 0);
  const failedCount = Number(stats?.failed || 0);
  const pendingJobs = pendingCount + processingCount;

  if ((routeStatus === 'pausado' || routeStatus === 'procesando') && pendingJobs === 0 && failedCount === 0) {
    await pool.query(
      `UPDATE lotes_carga
       SET estado = 'completado'
       WHERE id = ? AND sede_id = ? AND estado IN ('pausado', 'procesando')`,
      [loteId, sedeId]
    );
    routeStatus = 'completado';
  }

  const pausedJobs = routeStatus === 'pausado' ? pendingJobs : failedCount;
  const hasInterruptedFlow = routeStatus === 'pausado' || pausedJobs > 0;
  const isProcessing = routeStatus === 'procesando' || processingCount > 0;
  const isPaused = routeStatus === 'pausado';

  return {
    totalJobs: Number(stats?.total || 0),
    routeStatus,
    pendingCount,
    queuedCount: processingCount,
    failedCount,
    pendingJobs,
    processingJobs: processingCount,
    pausedJobs,
    hasInterruptedFlow,
    lastError: toWhatsappUserMessage(stats?.last_error),
    isProcessing,
    isPaused,
    canResume: isPaused && (pendingJobs > 0 || failedCount > 0),
    canPause: isProcessing && pendingJobs > 0,
    canCancel: pendingJobs > 0 || hasInterruptedFlow
  };
}

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

    const conectado = await whatsappService.isConnected(sesion.session_key);
    if (!conectado) {
      await pool.query(
        `UPDATE lotes_carga SET estado = 'pausado' WHERE id = ? AND sede_id = ?`,
        [lote_id, sede_id]
      );

      return res.status(409).json({
        ok: false,
        code: 'WHATSAPP_DISCONNECTED',
        requiresIntervention: true,
        control: await getLoteQueueControl(Number(lote_id), Number(sede_id)),
        message: 'WhatsApp no esta conectado. Reconecta la sesion y luego decide si deseas retomar el envio.'
      });
    }

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

    const dispatch = await claimAvisosForDispatch(Number(lote_id), Number(sede_id));
    if (!dispatch.avisos.length) {
      return res.status(409).json({
        ok: false,
        code: 'NO_PENDING_MESSAGES',
        message: 'No hay avisos pendientes o ya existe un despacho activo para este lote'
      });
    }

    try {
      await encolarLote(Number(lote_id), dispatch.avisos, Number(whatsapp_sesion_id));
    } catch (queueError) {
      await releaseFailedDispatch(dispatch.dispatchPrefix);
      throw queueError;
    }

    return res.json({
      ok: true,
      queued: dispatch.avisos.length,
      skipped: 0,
      replaced_jobs: 0,
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

export const pausarLoteWhatsApp = async (req: AuthRequest, res: Response) => {
  try {
    const { loteId } = req.params;
    const sede_id = req.user?.sede_id;

    if (!sede_id || !loteId) {
      return res.status(400).json({ ok: false, message: 'loteId es obligatorio' });
    }

    const [loteRows]: any = await pool.query(
      `SELECT id, estado
       FROM lotes_carga
       WHERE id = ? AND sede_id = ?
       LIMIT 1`,
      [loteId, sede_id]
    );

    if (!loteRows.length) {
      return res.status(404).json({ ok: false, message: 'Lote no encontrado o no pertenece a tu sede' });
    }

    const removedJobs = await removeQueuedJobsForLote(Number(loteId));

    const [result]: any = await pool.query(
      `UPDATE avisos_diarios
       SET estado_aviso = 'pendiente',
           error_detalle = 'Envio pausado manualmente por el usuario'
       WHERE lote_id = ?
         AND sede_id = ?
         AND estado_aviso IN ('pendiente', 'en_cola')`,
      [loteId, sede_id]
    );

    await pool.query(
      `UPDATE lotes_carga
       SET estado = 'pausado'
       WHERE id = ? AND sede_id = ?`,
      [loteId, sede_id]
    );

    return res.json({
      ok: true,
      paused: result.affectedRows,
      removed_jobs: removedJobs,
      control: await getLoteQueueControl(Number(loteId), Number(sede_id)),
      message: `Envio pausado. Se detuvieron ${result.affectedRows} mensajes pendientes o en cola.`
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, message: 'Error al pausar el envio de la ruta', error: error.message });
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
      `SELECT id, activo, session_key FROM whatsapp_sesiones WHERE id = ? AND sede_id = ? LIMIT 1`,
      [whatsapp_sesion_id, sede_id]
    );
    if (!sesionRows.length || !sesionRows[0].activo) {
      return res.status(404).json({ ok: false, message: 'Sesión inactiva o no encontrada' });
    }

    const conectado = await whatsappService.isConnected(sesionRows[0].session_key);
    if (!conectado) {
      return res.status(409).json({
        ok: false,
        code: 'WHATSAPP_DISCONNECTED',
        message: 'WhatsApp no esta conectado. Reconecta la sesion antes de retomar esta ruta.'
      });
    }

    // Los trabajos residuales se vuelven inofensivos al perder la propiedad
    // id_trabajo_cola. No se eliminan aqui para evitar carreras entre dos resumes.
    const removedJobs = 0;

    // 4. Reclamar atomicamente pendientes/fallidos para este despacho.
    const dispatch = await claimAvisosForDispatch(Number(loteId), Number(sede_id), true);
    const avisosRows = dispatch.avisos;
    if (!dispatch.avisos.length) {
      return res.status(400).json({ ok: false, message: 'No hay mensajes pendientes o fallidos para reanudar' });
    }

    try {
      await encolarLote(Number(loteId), dispatch.avisos, Number(whatsapp_sesion_id));
    } catch (queueError) {
      await releaseFailedDispatch(dispatch.dispatchPrefix);
      throw queueError;
    }

    return res.json({
      ok: true,
      resumed: dispatch.avisos.length,
      message: `Se reanudó el envío de ${avisosRows.length} mensajes. Se removieron ${removedJobs} de la cola anterior.`
    });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};

export const marcarLoteWhatsAppManual = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { loteId } = req.params;
    const { medio_manual = 'whatsapp_manual', observacion_manual = null } = req.body || {};
    const sede_id = req.user?.sede_id;
    const usuario_id = req.user?.id;
    const mediosValidos = ['whatsapp_manual', 'llamada', 'otro'];
    const medioManual = mediosValidos.includes(String(medio_manual)) ? String(medio_manual) : 'whatsapp_manual';
    const observacionManual = String(observacion_manual || '').replace(/\s+/g, ' ').trim().slice(0, 255) || null;

    if (!sede_id || !usuario_id || !loteId) {
      return res.status(400).json({ ok: false, message: 'loteId es obligatorio' });
    }

    await connection.beginTransaction();

    // 1. Validar lote
    const [loteRows]: any = await connection.query(
      `SELECT id FROM lotes_carga WHERE id = ? AND sede_id = ? LIMIT 1`,
      [loteId, sede_id]
    );
    if (!loteRows.length) {
      await connection.rollback();
      return res.status(404).json({ ok: false, message: 'Lote no encontrado o no pertenece a tu sede' });
    }

    // 2. Obtener avisos que seran cerrados por trabajo manual de oficina.
    //    Los registros sin_whatsapp se conservan para que el usuario identifique
    //    claramente que clientes no tienen cuenta WhatsApp.
    const [avisosRows]: any = await connection.query(
      `SELECT id, telefono, nombre, whatsapp_sesion_id
       FROM avisos_diarios
       WHERE lote_id = ?
         AND sede_id = ?
         AND estado_aviso IN ('pendiente', 'en_cola', 'fallido')
       ORDER BY id ASC`,
      [loteId, sede_id]
    );

    if (!avisosRows.length) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        message: 'No hay mensajes pendientes o fallidos para cerrar manualmente.'
      });
    }

    // 3. Remover de BullMQ antes de cerrar en base de datos
    const removedJobs = await removeQueuedJobsForLote(Number(loteId));

    // 4. Actualizar estado de los avisos a cierre manual auditado
    const [result]: any = await connection.query(
      `UPDATE avisos_diarios
       SET estado_aviso = 'enviado_manual',
           error_detalle = NULL,
           fecha_envio = NOW(),
           marcado_manual_por = ?,
           fecha_marcado_manual = NOW(),
           medio_manual = ?,
           observacion_manual = ?
       WHERE lote_id = ?
         AND sede_id = ?
         AND estado_aviso IN ('pendiente', 'en_cola', 'fallido')`,
      [usuario_id, medioManual, observacionManual, loteId, sede_id]
    );

    const logMessage = [
      `Cierre manual registrado por ${req.user?.nombre || req.user?.usuario || 'usuario'}`,
      `medio=${medioManual}`,
      observacionManual ? `observacion=${observacionManual}` : null
    ].filter(Boolean).join(' | ');

    for (const aviso of avisosRows) {
      await connection.query(
        `INSERT INTO mensajes_log
          (sede_id, lote_id, aviso_id, whatsapp_sesion_id, telefono, nombre_destinatario, estado_envio, whatsapp_message_id, error_detalle, fecha_envio)
         VALUES (?, ?, ?, ?, ?, ?, 'enviado_manual', NULL, ?, NOW())`,
        [
          sede_id,
          loteId,
          aviso.id,
          aviso.whatsapp_sesion_id || null,
          aviso.telefono,
          aviso.nombre || null,
          logMessage
        ]
      );
    }

    // 5. Marcar lote como completado porque los pendientes fueron resueltos fuera del sistema
    await connection.query(
      `UPDATE lotes_carga SET estado = 'completado' WHERE id = ? AND sede_id = ?`,
      [loteId, sede_id]
    );

    await connection.commit();

    return res.json({
      ok: true,
      processed: result.affectedRows,
      removed_jobs: removedJobs,
      estado: 'enviado_manual',
      message: `Se registraron ${result.affectedRows} mensajes como cierre manual y se limpiaron ${removedJobs} trabajos de la cola.`
    });
  } catch (error: any) {
    await connection.rollback();
    return res.status(500).json({ ok: false, error: error.message });
  } finally {
    connection.release();
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
    const canceled = await removeQueuedJobsForLote(Number(loteId));

    // 3. Actualizar estado de los avisos pendientes a 'cancelado' en base de datos
    const [result]: any = await pool.query(
      `UPDATE avisos_diarios
       SET estado_aviso = 'cancelado', error_detalle = 'Cancelado por el usuario'
       WHERE lote_id = ? AND sede_id = ? AND estado_aviso IN ('pendiente', 'en_cola', 'fallido')`,
      [loteId, sede_id]
    );

    // 4. Marcar lote como 'cancelado'
    await pool.query(
      `UPDATE lotes_carga SET estado = 'cancelado' WHERE id = ? AND sede_id = ?`,
      [loteId, sede_id]
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
