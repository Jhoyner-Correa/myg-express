import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middlewares/authMiddleware';
import { classifyPackageSize } from '../utils/packageSizeClassifier';

const DELIVERY_STATES = new Set(['pendiente', 'recogido']);
const DATE_FILTERS = new Set(['hoy', 'ayer', '7dias', '30dias']);

function single(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] || '');
  if (typeof value === 'object' && value !== null) return '';
  return String(value || '');
}

function normalizeText(value: unknown): string {
  return single(value).trim();
}

function normalizeDigits(value: unknown): string {
  return String(value || '').replace(/[^\d]/g, '').trim();
}

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

function addDateFilter(where: string[], params: any[], fecha: string) {
  if (!fecha) return;

  if (DATE_FILTERS.has(fecha)) {
    if (fecha === 'hoy') where.push('DATE(a.created_at) = CURDATE()');
    if (fecha === 'ayer') where.push('DATE(a.created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)');
    if (fecha === '7dias') where.push('a.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
    if (fecha === '30dias') where.push('a.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
    return;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    where.push('DATE(a.created_at) = ?');
    params.push(fecha);
  }
}

function mapPackage(row: any) {
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

function makeClientKey(normalizedName: string, telefono: string): string {
  const payload = JSON.stringify({
    n: String(normalizedName || '').toLowerCase().trim(),
    t: String(telefono || '').trim()
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function parseClientKey(key: string): { n: string; t: string } | null {
  try {
    const raw = Buffer.from(String(key || ''), 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const n = String(parsed?.n || '').toLowerCase().trim();
    const t = String(parsed?.t || '').trim();
    if (!n && !t) return null;
    return { n, t };
  } catch {
    return null;
  }
}

function mapClient(row: any) {
  const normalizedName = String(row.normalized_name || '').toLowerCase().trim();
  const telefono = String(row.telefono || '').trim();
  return {
    cliente_key: makeClientKey(normalizedName, telefono),
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

    const q = normalizeText(req.query.q);
    const fecha = normalizeText(req.query.fecha).toLowerCase();
    const loteId = normalizeText(req.query.lote_id);
    const estado = normalizeText(req.query.estado).toLowerCase();
    const limit = Math.min(Math.max(Number(req.query.limit || 30), 1), 60);

    const where = ['a.sede_id = ?', 'l.fecha_eliminacion IS NULL', 'l.entregas_habilitado = 1'];
    const params: any[] = [sedeId];

    if (q) {
      const like = `%${q}%`;
      const digits = normalizeDigits(q);
      where.push(`(
        a.codigo_paquete LIKE ?
        OR a.telefono LIKE ?
        OR a.nombre LIKE ?
      )`);
      params.push(like, `%${digits || q}%`, like);
    }

    if (DELIVERY_STATES.has(estado)) {
      where.push('a.estado_entrega = ?');
      params.push(estado);
    }

    if (/^\d+$/.test(loteId)) {
      where.push('a.lote_id = ?');
      params.push(Number(loteId));
    }

    addDateFilter(where, params, fecha);

    const [rows]: any = await pool.query(
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
        total_paquetes: data.reduce((acc: number, item: any) => acc + item.total, 0),
        pendientes: data.reduce((acc: number, item: any) => acc + item.pendientes, 0),
        recogidos: data.reduce((acc: number, item: any) => acc + item.recogidos, 0)
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al buscar clientes',
      error: error.message
    });
  }
}

export async function obtenerPaquetesCliente(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const client = parseClientKey(req.params.key);
    if (!client) {
      return res.status(400).json({
        ok: false,
        message: 'Cliente invalido'
      });
    }

    const [rows]: any = await pool.query(
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
        pendientes: data.filter((item: any) => item.estado_entrega === 'pendiente').length,
        recogidos: data.filter((item: any) => item.estado_entrega === 'recogido').length
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al obtener paquetes del cliente',
      error: error.message
    });
  }
}

export async function obtenerResumenEntregas(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const [rows]: any = await pool.query(
      `SELECT
        COUNT(*) AS total,
        SUM(COALESCE(a.estado_entrega, 'pendiente') = 'pendiente') AS pendientes,
        SUM(COALESCE(a.estado_entrega, 'pendiente') = 'recogido') AS recogidos
       FROM avisos_diarios a
       INNER JOIN lotes_carga l ON l.id = a.lote_id
       WHERE a.sede_id = ?
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
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al cargar el resumen de entregas',
      error: error.message
    });
  }
}

export async function buscarPaquetesEntrega(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const q = normalizeText(req.query.q);
    const estado = normalizeText(req.query.estado).toLowerCase();
    const fecha = normalizeText(req.query.fecha).toLowerCase();
    const loteId = normalizeText(req.query.lote_id);
    const limit = Math.min(Math.max(Number(req.query.limit || 200), 1), 300);

    const where = ['a.sede_id = ?', 'l.fecha_eliminacion IS NULL', 'l.entregas_habilitado = 1'];
    const params: any[] = [sedeId];

    if (q) {
      const like = `%${q}%`;
      const digits = normalizeDigits(q);
      where.push(`(
        a.codigo_paquete LIKE ?
        OR a.telefono LIKE ?
        OR a.nombre LIKE ?
      )`);
      params.push(like, `%${digits || q}%`, like);
    }

    if (DELIVERY_STATES.has(estado)) {
      where.push('a.estado_entrega = ?');
      params.push(estado);
    }

    if (/^\d+$/.test(loteId)) {
      where.push('a.lote_id = ?');
      params.push(Number(loteId));
    }

    addDateFilter(where, params, fecha);

    const [rows]: any = await pool.query(
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
    const pendientes = data.filter((item: any) => item.estado_entrega === 'pendiente').length;
    const recogidos = data.filter((item: any) => item.estado_entrega === 'recogido').length;

    return res.json({
      ok: true,
      data,
      resumen: {
        total: data.length,
        pendientes,
        recogidos
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al buscar paquetes',
      error: error.message
    });
  }
}

export async function marcarPaqueteRecogido(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const id = Number(req.params.id);
    const observacion = normalizeText(req.body?.observacion).slice(0, 255) || null;

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'ID de paquete invalido'
      });
    }

    const [result]: any = await pool.query(
      `UPDATE avisos_diarios a
       SET estado_entrega = 'recogido',
           fecha_entrega = NOW(),
           entregado_por = ?,
           observacion_entrega = ?
       WHERE a.id = ?
         AND a.sede_id = ?
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
      return res.status(404).json({
        ok: false,
        message: 'Paquete no encontrado o su ruta no fue enviada a Gestion de entregas'
      });
    }

    return res.json({
      ok: true,
      message: 'Paquete marcado como recogido'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al marcar el paquete como recogido',
      error: error.message
    });
  }
}

export async function revertirPaqueteRecogido(req: AuthRequest, res: Response) {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        message: 'ID de paquete invalido'
      });
    }

    const [result]: any = await pool.query(
      `UPDATE avisos_diarios a
       SET estado_entrega = 'pendiente',
           fecha_entrega = NULL,
           entregado_por = NULL,
           observacion_entrega = NULL
       WHERE a.id = ?
         AND a.sede_id = ?
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
      return res.status(404).json({
        ok: false,
        message: 'Paquete no encontrado o su ruta no fue enviada a Gestion de entregas'
      });
    }

    return res.json({
      ok: true,
      message: 'Paquete devuelto a pendiente'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al revertir la entrega',
      error: error.message
    });
  }
}
