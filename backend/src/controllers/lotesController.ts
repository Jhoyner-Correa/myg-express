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
  const cleanBaseName = String(baseName || '').trim();
  return cleanBaseName ? `Ruta ${routeNumber} - ${cleanBaseName}` : `Ruta ${routeNumber}`;
}

// Crear ruta
export const crearLote = async (req: AuthRequest, res: Response) => {
  try {
    const { nombre_lote, observacion } = req.body;
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
      `INSERT INTO lotes_carga (sede_id, id_usuario_creador, fecha, zona, nombre_lote, observacion)
       VALUES (?, ?, CURDATE(), ?, ?, ?)`,
      [sede_id, usuario_id, nombreBase, routeName, observacion || null]
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
        l.observacion,
        (SELECT COUNT(*) FROM avisos_diarios a WHERE a.lote_id = l.id) AS total_registros,
        l.estado,
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
        l.observacion,
        (SELECT COUNT(*) FROM avisos_diarios a WHERE a.lote_id = l.id) AS total_registros,
        l.estado,
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
        MAX(CASE WHEN estado_aviso = 'fallido' THEN SUBSTRING(error_detalle, 1, 100) ELSE NULL END) as last_error
       FROM avisos_diarios
       WHERE lote_id = ?`,
      [id]
    );

    const stats = statsRows[0] || { total: 0, pending: 0, en_cola: 0, failed: 0, last_error: null };
    const pendingJobs = Number(stats.pending || 0) + Number(stats.en_cola || 0);
    const pausedJobs = Number(stats.failed || 0);
    const hasInterruptedFlow = pausedJobs > 0;

    const control_envio = {
      totalJobs: Number(stats.total || 0),
      pendingJobs,
      processingJobs: Number(stats.en_cola || 0),
      pausedJobs,
      hasInterruptedFlow,
      lastError: stats.last_error,
      canResume: hasInterruptedFlow || pendingJobs > 0,
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
