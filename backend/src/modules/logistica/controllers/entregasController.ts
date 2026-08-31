import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../core/database/database';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';
import { classifyPackageSize } from '../../../core/utils/packageSizeClassifier';
import {
  makeDeliveryClientKey,
  normalizeDeliveryDigits,
  normalizeDeliveryText,
  parseDeliveryClientKey,
  parseDeliveryLimit,
} from '../domain/deliveryDomain';

const DELIVERY_STATES = new Set(['pendiente', 'recogido']);
const DATE_FILTERS = new Set(['hoy', 'ayer', '7dias', '30dias']);

type SqlValue = string | number | null;

type DeliveryRow = RowDataPacket & {
  id: number;
  lote_id: number;
  cliente: string | null;
  telefono: string | null;
  codigo_paquete: string | null;
  peso_kg: number | string | null;
  tipo_paquete_urbano: string | null;
  piezas: number | string | null;
  contenido_paquete: string | null;
  estado_entrega: string | null;
  estado_aviso: string;
  fecha_ingreso: Date | string;
  fecha_entrega: Date | string | null;
  observacion_entrega: string | null;
  nombre_lote: string;
  zona: string;
  fecha_ruta: Date | string;
  estado_lote: string;
  entregado_por_nombre: string | null;
};

type ClientRow = RowDataPacket & {
  normalized_name: string;
  telefono: string;
  nombre: string | null;
  total: number | string;
  pendientes: number | string;
  recogidos: number | string;
  ultimo_ingreso: Date | string | null;
  rutas_resumen: string | null;
  coincidencia_codigo: string | null;
};

type SummaryRow = RowDataPacket & { total: number | string; pendientes: number | string; recogidos: number | string };

function requireSede(req: AuthRequest, res: Response): number | null {
  const sedeId = Number(req.user?.sede_id);
  if (!Number.isFinite(sedeId) || sedeId <= 0) {
    res.status(403).json({
      ok: false,
      message: 'Este modulo solo esta disponible para usuarios asignados a una sede.'
    });
    return null;
  }
  return sedeId;
}

function addDateFilter(where: string[], params: SqlValue[], fecha: string) {
  if (!fecha) return;

  if (DATE_FILTERS.has(fecha)) {
    if (fecha === 'hoy') where.push('a.created_at >= CURDATE() AND a.created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)');
    if (fecha === 'ayer') where.push('a.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND a.created_at < CURDATE()');
    if (fecha === '7dias') where.push('a.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
    if (fecha === '30dias') where.push('a.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    return;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    where.push('a.created_at >= ? AND a.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(fecha, fecha);
  }
}

function mapPackage(row: DeliveryRow) {
  const pesoKg = row.peso_kg !== null && row.peso_kg !== undefined ? Number(row.peso_kg) : null;

  return {
    id: row.id,
    lote_id: row.lote_id,
    cliente: row.cliente,
    telefono: row.telefono,
    codigo_paquete: row.codigo_paquete,
    peso_kg: pesoKg,
    tamano_paquete: classifyPackageSize(pesoKg),
    tipo_paquete_urbano: row.tipo_paquete_urbano || null,
    piezas: row.piezas !== null && row.piezas !== undefined ? Number(row.piezas) : null,
    contenido_paquete: row.contenido_paquete || null,
    estado_entrega: row.estado_entrega || 'pendiente',
    estado_aviso: row.estado_aviso,
    fecha_ingreso: row.fecha_ingreso,
    fecha_entrega: row.fecha_entrega,
    observacion_entrega: row.observacion_entrega,
    ruta: {
      id: row.lote_id,
      nombre: row.nombre_lote,
      zona: row.zona,
      fecha: row.fecha_ruta,
      estado: row.estado_lote
    },
    entregado_por: row.entregado_por_nombre || null
  };
}

function mapClient(row: ClientRow) {
  const normalizedName = String(row.normalized_name || '').toLowerCase().trim();
  const telefono = String(row.telefono || '').trim();
  return {
    cliente_key: makeDeliveryClientKey(normalizedName, telefono),
    nombre: row.nombre || 'Sin nombre',
    telefono: telefono || null,
    total: Number(row.total || 0),
    pendientes: Number(row.pendientes || 0),
    recogidos: Number(row.recogidos || 0),
    ultimo_ingreso: row.ultimo_ingreso || null,
    rutas_resumen: row.rutas_resumen || null,
    coincidencia_codigo: row.coincidencia_codigo || null
  };
}

export async function buscarClientesEntrega(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const q = normalizeDeliveryText(req.query.q);
    const fecha = normalizeDeliveryText(req.query.fecha).toLowerCase();
    const loteId = normalizeDeliveryText(req.query.lote_id);
    const estado = normalizeDeliveryText(req.query.estado).toLowerCase();
    const limit = parseDeliveryLimit(req.query.limit, 30, 60);

    const where = ['a.sede_id = ?', 'l.sede_id = a.sede_id', 'l.fecha_eliminacion IS NULL', 'l.entregas_habilitado = 1'];
    const params: SqlValue[] = [sedeId];

    if (q) {
      const like = `%${q}%`;
      const digits = normalizeDeliveryDigits(q);
      where.push(`(
        a.codigo_paquete LIKE ?
        OR a.telefono LIKE ?
        OR a.nombre LIKE ?
      )`);
      params.push(like, `%${digits || q}%`, like);
    }

    if (DELIVERY_STATES.has(estado)) {
      where.push("COALESCE(a.estado_entrega, 'pendiente') = ?");
      params.push(estado);
    }

    if (/^\d+$/.test(loteId)) {
      where.push('a.lote_id = ?');
      params.push(Number(loteId));
    }

    addDateFilter(where, params, fecha);

    const [rows] = await pool.query<ClientRow[]>(
      `SELECT
        LOWER(TRIM(COALESCE(a.nombre, ''))) AS normalized_name,
        COALESCE(a.telefono, '') AS telefono,
        MAX(NULLIF(a.nombre, '')) AS nombre,
        COUNT(*) AS total,
        SUM(COALESCE(a.estado_entrega, 'pendiente') = 'pendiente') AS pendientes,
        SUM(COALESCE(a.estado_entrega, 'pendiente') = 'recogido') AS recogidos,
        MAX(a.created_at) AS ultimo_ingreso,
        GROUP_CONCAT(DISTINCT l.nombre_lote ORDER BY l.fecha DESC SEPARATOR ', ') AS rutas_resumen,
        MAX(CASE WHEN a.codigo_paquete LIKE ? THEN a.codigo_paquete ELSE NULL END) AS coincidencia_codigo
       FROM avisos_diarios a
       INNER JOIN lotes_carga l ON l.id = a.lote_id
       WHERE ${where.join(' AND ')}
       GROUP BY LOWER(TRIM(COALESCE(a.nombre, ''))), COALESCE(a.telefono, '')
       ORDER BY pendientes DESC, ultimo_ingreso DESC
       LIMIT ?`,
      [`%${q}%`, ...params, limit]
    );

    const data = rows.map(mapClient);
    return res.json({
      ok: true,
      data,
      resumen: {
        total_clientes: data.length,
        total_paquetes: data.reduce((acc, item) => acc + item.total, 0),
        pendientes: data.reduce((acc, item) => acc + item.pendientes, 0),
        recogidos: data.reduce((acc, item) => acc + item.recogidos, 0)
      }
    });
  } catch (error) {
    console.error('[entregas] Error al buscar clientes:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al buscar clientes'
    });
  }
}

export async function obtenerPaquetesCliente(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const client = parseDeliveryClientKey(req.params.key);
    if (!client) {
      return res.status(400).json({
        ok: false,
        message: 'Cliente invalido'
      });
    }

    const [rows] = await pool.query<DeliveryRow[]>(
      `SELECT
        a.id,
        a.lote_id,
        a.nombre AS cliente,
        a.telefono,
        a.codigo_paquete,
        a.peso_kg,
        a.tipo_paquete_urbano,
        a.piezas,
        a.contenido_paquete,
        COALESCE(a.estado_entrega, 'pendiente') AS estado_entrega,
        a.estado_aviso,
        a.created_at AS fecha_ingreso,
        a.fecha_entrega,
        a.observacion_entrega,
        l.nombre_lote,
        l.zona,
        l.fecha AS fecha_ruta,
        l.estado AS estado_lote,
        u.nombre AS entregado_por_nombre
       FROM avisos_diarios a
       INNER JOIN lotes_carga l ON l.id = a.lote_id
       LEFT JOIN usuarios u ON u.id = a.entregado_por
       WHERE a.sede_id = ?
        AND l.sede_id = a.sede_id
        AND l.fecha_eliminacion IS NULL
        AND l.entregas_habilitado = 1
        AND LOWER(TRIM(COALESCE(a.nombre, ''))) = ?
        AND COALESCE(a.telefono, '') = ?
       ORDER BY
        CASE COALESCE(a.estado_entrega, 'pendiente') WHEN 'pendiente' THEN 0 ELSE 1 END,
        a.created_at DESC,
        a.id DESC`,
      [sedeId, client.n, client.t]
    );

    const data = rows.map(mapPackage);
    return res.json({
      ok: true,
      data,
      cliente: data.length ? {
        nombre: data[0].cliente || 'Sin nombre',
        telefono: data[0].telefono || null,
        cliente_key: req.params.key
      } : null,
      resumen: {
        total: data.length,
        pendientes: data.filter(item => item.estado_entrega === 'pendiente').length,
        recogidos: data.filter(item => item.estado_entrega === 'recogido').length
      }
    });
  } catch (error) {
    console.error('[entregas] Error al obtener paquetes del cliente:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al obtener paquetes del cliente'
    });
  }
}

export async function obtenerResumenEntregas(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const [rows] = await pool.query<SummaryRow[]>(
      `SELECT
        COUNT(*) AS total,
        SUM(COALESCE(a.estado_entrega, 'pendiente') = 'pendiente') AS pendientes,
        SUM(COALESCE(a.estado_entrega, 'pendiente') = 'recogido') AS recogidos
       FROM avisos_diarios a
       INNER JOIN lotes_carga l ON l.id = a.lote_id
       WHERE a.sede_id = ?
         AND l.sede_id = a.sede_id
         AND l.fecha_eliminacion IS NULL
         AND l.entregas_habilitado = 1`,
      [sedeId]
    );

    const row = rows?.[0] || {};
    return res.json({
      ok: true,
      data: {
        total: Number(row.total || 0),
        pendientes: Number(row.pendientes || 0),
        recogidos: Number(row.recogidos || 0)
      }
    });
  } catch (error) {
    console.error('[entregas] Error al cargar el resumen:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al cargar el resumen de entregas'
    });
  }
}

export async function buscarPaquetesEntrega(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const q = normalizeDeliveryText(req.query.q);
    const estado = normalizeDeliveryText(req.query.estado).toLowerCase();
    const fecha = normalizeDeliveryText(req.query.fecha).toLowerCase();
    const loteId = normalizeDeliveryText(req.query.lote_id);
    const limit = parseDeliveryLimit(req.query.limit, 200, 300);

    const where = ['a.sede_id = ?', 'l.sede_id = a.sede_id', 'l.fecha_eliminacion IS NULL', 'l.entregas_habilitado = 1'];
    const params: SqlValue[] = [sedeId];

    if (q) {
      const like = `%${q}%`;
      const digits = normalizeDeliveryDigits(q);
      where.push(`(
        a.codigo_paquete LIKE ?
        OR a.telefono LIKE ?
        OR a.nombre LIKE ?
      )`);
      params.push(like, `%${digits || q}%`, like);
    }

    if (DELIVERY_STATES.has(estado)) {
      where.push("COALESCE(a.estado_entrega, 'pendiente') = ?");
      params.push(estado);
    }

    if (/^\d+$/.test(loteId)) {
      where.push('a.lote_id = ?');
      params.push(Number(loteId));
    }

    addDateFilter(where, params, fecha);

    const [rows] = await pool.query<DeliveryRow[]>(
      `SELECT
        a.id,
        a.lote_id,
        a.nombre AS cliente,
        a.telefono,
        a.codigo_paquete,
        a.peso_kg,
        a.tipo_paquete_urbano,
        a.piezas,
        a.contenido_paquete,
        COALESCE(a.estado_entrega, 'pendiente') AS estado_entrega,
        a.estado_aviso,
        a.created_at AS fecha_ingreso,
        a.fecha_entrega,
        a.observacion_entrega,
        l.nombre_lote,
        l.zona,
        l.fecha AS fecha_ruta,
        l.estado AS estado_lote,
        u.nombre AS entregado_por_nombre
       FROM avisos_diarios a
       INNER JOIN lotes_carga l ON l.id = a.lote_id
       LEFT JOIN usuarios u ON u.id = a.entregado_por
       WHERE ${where.join(' AND ')}
       ORDER BY
        CASE COALESCE(a.estado_entrega, 'pendiente') WHEN 'pendiente' THEN 0 ELSE 1 END,
        a.created_at DESC,
        a.id DESC
       LIMIT ?`,
      [...params, limit]
    );

    const data = rows.map(mapPackage);
    const pendientes = data.filter(item => item.estado_entrega === 'pendiente').length;
    const recogidos = data.filter(item => item.estado_entrega === 'recogido').length;

    return res.json({
      ok: true,
      data,
      resumen: {
        total: data.length,
        pendientes,
        recogidos
      }
    });
  } catch (error) {
    console.error('[entregas] Error al buscar paquetes:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al buscar paquetes'
    });
  }
}

export async function marcarPaqueteRecogido(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const id = Number(req.params.id);
    const observacion = normalizeDeliveryText(req.body?.observacion).slice(0, 255) || null;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'ID de paquete invalido'
      });
    }

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE avisos_diarios a
       SET estado_entrega = 'recogido',
           fecha_entrega = NOW(),
           entregado_por = ?,
           observacion_entrega = ?
       WHERE a.id = ?
         AND a.sede_id = ?
         AND COALESCE(a.estado_entrega, 'pendiente') = 'pendiente'
         AND EXISTS (
           SELECT 1
           FROM lotes_carga l
           WHERE l.id = a.lote_id
             AND l.sede_id = a.sede_id
             AND l.fecha_eliminacion IS NULL
             AND l.entregas_habilitado = 1
         )`,
      [req.user?.id || null, observacion, id, sedeId]
    );

    if (!result.affectedRows) {
      return res.status(409).json({
        ok: false,
        message: 'El paquete ya fue entregado, no existe o su ruta no está habilitada para entregas.'
      });
    }

    return res.json({
      ok: true,
      message: 'Paquete marcado como recogido'
    });
  } catch (error) {
    console.error('[entregas] Error al confirmar la entrega:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al marcar el paquete como recogido'
    });
  }
}

export async function revertirPaqueteRecogido(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'ID de paquete invalido'
      });
    }

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE avisos_diarios a
       SET estado_entrega = 'pendiente',
           fecha_entrega = NULL,
           entregado_por = NULL,
           observacion_entrega = NULL
       WHERE a.id = ?
         AND a.sede_id = ?
         AND a.estado_entrega = 'recogido'
         AND EXISTS (
           SELECT 1
           FROM lotes_carga l
           WHERE l.id = a.lote_id
             AND l.sede_id = a.sede_id
             AND l.fecha_eliminacion IS NULL
             AND l.entregas_habilitado = 1
         )`,
      [id, sedeId]
    );

    if (!result.affectedRows) {
      return res.status(409).json({
        ok: false,
        message: 'El paquete ya está pendiente, no existe o su ruta no está habilitada para entregas.'
      });
    }

    return res.json({
      ok: true,
      message: 'Paquete devuelto a pendiente'
    });
  } catch (error) {
    console.error('[entregas] Error al revertir la entrega:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al revertir la entrega'
    });
  }
}
