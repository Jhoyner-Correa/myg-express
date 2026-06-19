import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middlewares/authMiddleware';

function normalizeRouteBaseName(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isValidRouteBaseName(value: string) {
  if (!value) return false;
  if (/\d/.test(value)) return false;
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s.'-]+$/.test(value);
}

function buildRouteName(routeNumber: number, baseName: string) {
  return String(baseName || '').trim();
}

// Crear ruta
export const crearLote = async (req: AuthRequest, res: Response) => {
  try {
    const { nombre_lote } = req.body;
    const sede_id = req.user?.sede_id;
    const usuario_id = req.user?.id;
    const nombreBase = normalizeRouteBaseName(nombre_lote);

    if (!sede_id) {
      return res.status(400).json({
        ok: false,
        message: 'Sesión inválida'
      });
    }

    if (!isValidRouteBaseName(nombreBase)) {
      return res.status(400).json({
        ok: false,
        message: 'El nombre de la ruta es obligatorio y no puede contener numeros.'
      });
    }

    const [[conteoHoy]]: any = await pool.query(
      `SELECT COUNT(*) AS total
         FROM lotes_carga
        WHERE sede_id = ?
          AND fecha = CURDATE()`,
      [sede_id]
    );

    const nextRouteNumber = Number(conteoHoy?.total || 0) + 1;
    const routeName = buildRouteName(nextRouteNumber, nombreBase);

    const [result]: any = await pool.query(
      `INSERT INTO lotes_carga (sede_id, id_usuario_creador, fecha, zona, nombre_lote, estado)
       VALUES (?, ?, CURDATE(), ?, ?, 'pendiente')`,
      [sede_id, usuario_id, nombreBase, routeName]
    );

    return res.status(201).json({
      ok: true,
      message: 'Ruta creada correctamente',
      lote_id: result.insertId,
      data: {
        id: result.insertId,
        nombre_lote: routeName,
        fecha: new Date().toISOString().slice(0, 10)
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al crear ruta',
      error: error.message
    });
  }
};

// Listar rutas de la sede del usuario
export const listarLotes = async (req: AuthRequest, res: Response) => {
  try {
    const sede_id = req.user?.sede_id;

    const [rows] = await pool.query(
      `SELECT 
        l.id,
        l.sede_id,
        s.nombre AS sede_nombre,
        l.fecha,
        l.zona,
        l.nombre_lote,
        (SELECT COUNT(*) FROM avisos_diarios a WHERE a.lote_id = l.id) AS total_registros,
        CASE WHEN l.estado = 'borrador' THEN 'pendiente' ELSE l.estado END AS estado,
        l.entregas_habilitado,
        l.fecha_habilitado_entregas,
        l.created_at
      FROM lotes_carga l
      INNER JOIN sedes s ON l.sede_id = s.id
      WHERE l.sede_id = ? AND l.fecha_eliminacion IS NULL
      ORDER BY l.fecha DESC, l.created_at DESC, l.id DESC`,
      [sede_id]
    );

    return res.json({
      ok: true,
      data: rows
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al listar rutas',
      error: error.message
    });
  }
};

// Ver detalle de ruta solo si pertenece a la sede
export const obtenerLotePorId = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const sede_id = req.user?.sede_id;

    const [rows]: any = await pool.query(
      `SELECT 
        l.id,
        l.sede_id,
        s.nombre AS sede_nombre,
        l.fecha,
        l.zona,
        l.nombre_lote,
        (SELECT COUNT(*) FROM avisos_diarios a WHERE a.lote_id = l.id) AS total_registros,
        CASE WHEN l.estado = 'borrador' THEN 'pendiente' ELSE l.estado END AS estado,
        l.entregas_habilitado,
        l.fecha_habilitado_entregas,
        l.created_at
      FROM lotes_carga l
      INNER JOIN sedes s ON l.sede_id = s.id
      WHERE l.id = ? AND l.sede_id = ? AND l.fecha_eliminacion IS NULL
      LIMIT 1`,
      [id, sede_id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Ruta no encontrada'
      });
    }

    const [statsRows]: any = await pool.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN estado_aviso = 'pendiente' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN estado_aviso = 'en_cola' THEN 1 ELSE 0 END) as en_cola,
        SUM(CASE WHEN estado_aviso = 'fallido' THEN 1 ELSE 0 END) as failed,
        MAX(CASE WHEN estado_aviso IN ('pendiente', 'en_cola', 'fallido') THEN SUBSTRING(error_detalle, 1, 160) ELSE NULL END) as last_error
       FROM avisos_diarios
       WHERE lote_id = ?`,
      [id]
    );

    const stats = statsRows[0] || { total: 0, pending: 0, en_cola: 0, failed: 0, last_error: null };
    let loteEstado = String(rows[0]?.estado || '').toLowerCase();
    const pendingCount = Number(stats.pending || 0);
    const processingCount = Number(stats.en_cola || 0);
    const failedCount = Number(stats.failed || 0);
    const pendingJobs = pendingCount + processingCount;

    if ((loteEstado === 'pausado' || loteEstado === 'procesando') && pendingJobs === 0 && failedCount === 0) {
      await pool.query(
        `UPDATE lotes_carga
         SET estado = 'completado'
         WHERE id = ? AND sede_id = ? AND estado IN ('pausado', 'procesando')`,
        [id, sede_id]
      );
      loteEstado = 'completado';
      rows[0].estado = 'completado';
    }

    const pausedJobs = loteEstado === 'pausado' ? pendingJobs : failedCount;
    const hasInterruptedFlow = loteEstado === 'pausado' || pausedJobs > 0;
    const isProcessing = loteEstado === 'procesando' || processingCount > 0;
    const isPaused = loteEstado === 'pausado';

    const control_envio = {
      totalJobs: Number(stats.total || 0),
      routeStatus: loteEstado,
      pendingCount,
      queuedCount: processingCount,
      failedCount,
      pendingJobs,
      processingJobs: processingCount,
      pausedJobs,
      hasInterruptedFlow,
      lastError: stats.last_error,
      isProcessing,
      isPaused,
      canResume: isPaused && (pendingJobs > 0 || failedCount > 0),
      canPause: isProcessing && pendingJobs > 0,
      canCancel: pendingJobs > 0 || hasInterruptedFlow
    };

    return res.json({
      ok: true,
      data: {
        ...rows[0],
        control_envio
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al obtener la ruta',
      error: error.message
    });
  }
};

// Actualizar nombre visible de la ruta sin romper su numeracion
export const actualizarLote = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nombre_lote } = req.body;
    const sede_id = req.user?.sede_id;
    const nombreBase = normalizeRouteBaseName(nombre_lote);

    if (!isValidRouteBaseName(nombreBase)) {
      return res.status(400).json({
        ok: false,
        message: 'El nombre de la ruta es obligatorio y no puede contener numeros.'
      });
    }

    const [rows]: any = await pool.query(
      `SELECT nombre_lote
         FROM lotes_carga
        WHERE id = ? AND sede_id = ?
        LIMIT 1`,
      [id, sede_id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Ruta no encontrada o no pertenece a tu sede.'
      });
    }

    const currentName = String(rows[0]?.nombre_lote || '').trim();
    const routeMatch = currentName.match(/^Ruta\s+(\d+)\s*-\s*(.+)$/i);
    const nextName = routeMatch ? buildRouteName(Number(routeMatch[1]), nombreBase) : nombreBase;

    await pool.query(
      `UPDATE lotes_carga SET nombre_lote = ? WHERE id = ? AND sede_id = ?`,
      [nextName, id, sede_id]
    );

    return res.json({
      ok: true,
      message: 'Ruta actualizada correctamente.',
      data: {
        id: Number(id),
        nombre_lote: nextName
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar la ruta.',
      error: error.message
    });
  }
};

// Publicar una ruta en Gestion de entregas. La consulta Urbano solo llena rutas;
// entregas queda habilitado explicitamente por el usuario desde Rutas.
export const habilitarEntregasLote = async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const sede_id = req.user?.sede_id;

    if (!sede_id) {
      return res.status(400).json({
        ok: false,
        message: 'Sesion invalida.'
      });
    }

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'ID de ruta invalido.'
      });
    }

    const [rows]: any = await pool.query(
      `SELECT
         l.id,
         l.nombre_lote,
         l.entregas_habilitado,
         COUNT(a.id) AS total_paquetes
       FROM lotes_carga l
       LEFT JOIN avisos_diarios a ON a.lote_id = l.id AND a.sede_id = l.sede_id
       WHERE l.id = ?
         AND l.sede_id = ?
         AND l.fecha_eliminacion IS NULL
       GROUP BY l.id, l.nombre_lote, l.entregas_habilitado
       LIMIT 1`,
      [id, sede_id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Ruta no encontrada o no pertenece a tu sede.'
      });
    }

    const route = rows[0];
    const totalPaquetes = Number(route.total_paquetes || 0);

    if (totalPaquetes <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'La ruta no tiene paquetes para enviar a Gestion de entregas.'
      });
    }

    if (Number(route.entregas_habilitado) === 1) {
      return res.json({
        ok: true,
        message: 'Esta ruta ya esta disponible en Gestion de entregas.',
        data: {
          id,
          entregas_habilitado: 1,
          total_paquetes: totalPaquetes
        }
      });
    }

    await pool.query(
      `UPDATE lotes_carga
       SET entregas_habilitado = 1,
           fecha_habilitado_entregas = NOW()
       WHERE id = ?
         AND sede_id = ?
         AND fecha_eliminacion IS NULL`,
      [id, sede_id]
    );

    return res.json({
      ok: true,
      message: 'Ruta enviada a Gestion de entregas correctamente.',
      data: {
        id,
        entregas_habilitado: 1,
        total_paquetes: totalPaquetes
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al enviar la ruta a Gestion de entregas.',
      error: error.message
    });
  }
};

// Eliminar ruta permanentemente (Hard Delete)
export const eliminarLote = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const sede_id = req.user?.sede_id;

    if (!id) {
      return res.status(400).json({
        ok: false,
        message: 'ID de ruta no proporcionado.'
      });
    }

    const [rows]: any = await pool.query(
      `SELECT id FROM lotes_carga WHERE id = ? AND sede_id = ? LIMIT 1`,
      [id, sede_id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Ruta no encontrada.'
      });
    }

    await pool.query(
      `DELETE FROM lotes_carga WHERE id = ? AND sede_id = ?`,
      [id, sede_id]
    );

    return res.json({
      ok: true,
      message: 'Ruta eliminada permanentemente.'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar la ruta permanentemente.',
      error: error.message
    });
  }
};
