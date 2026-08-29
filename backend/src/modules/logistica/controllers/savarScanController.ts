import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';
import { cleanSavarCode, cleanSavarText, MAX_SAVAR_IMPORT_ROWS, parseSavarImportRows, savarSedeScope } from '../domain/savarScanDomain';

const IMPORT_CHUNK_SIZE = 500;
const MAX_LIST_ROWS = 500;

type PackageStatus = 'PENDIENTE' | 'LLEGÓ';

type PackageRow = RowDataPacket & {
  id: number;
  sede_id: number;
  codigo_paquete: string;
  consignado: string;
  direccion: string;
  telefono: string | null;
  departamento: string;
  provincia: string;
  distrito: string;
  lote_importacion: string;
  estado: PackageStatus;
  fecha_escaneo: Date | string | null;
  usuario_id_escaneo: number | null;
  sede_id_escaneo: number | null;
};

type UserNameRow = RowDataPacket & { nombre: string };

type ScanOutcome = {
  status: number;
  body: Record<string, unknown>;
};

function requireSede(req: AuthRequest, res: Response): number | null {
  const sedeId = Number(req.user?.sede_id);
  if (!Number.isInteger(sedeId) || sedeId <= 0) {
    res.status(403).json({
      ok: false,
      message: 'Este módulo solo está disponible para usuarios asignados a una sede.',
    });
    return null;
  }
  return sedeId;
}

function internalError(res: Response, operation: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[savar-scan] ${operation}:`, detail);
  return res.status(500).json({ ok: false, message: `No se pudo ${operation.toLowerCase()}.` });
}

async function recordIncident(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  code: string,
  type: 'NO_EXISTE' | 'OTRO_LOTE' | 'DUPLICADO',
  userId: number,
  sedeId: number,
) {
  await connection.query<ResultSetHeader>(
    `INSERT INTO paquetes_auditoria (codigo_escaneado, tipo_incidencia, usuario_id, sede_id)
     VALUES (?, ?, ?, ?)`,
    [code, type, userId, sedeId],
  );
}

export const procesarEscaneo = async (req: AuthRequest, res: Response) => {
  const code = cleanSavarCode(req.body?.codigo);
  const activeLot = cleanSavarText(req.body?.lote_activo, 120);
  if (!code || !activeLot) {
    return res.status(400).json({ ok: false, message: 'El código y el lote activo son obligatorios.' });
  }

  const sedeId = requireSede(req, res);
  if (!sedeId) return;
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({ ok: false, message: 'Sesión inválida o expirada.' });
  }

  try {
    const outcome = await runInTransaction<ScanOutcome>(async connection => {
      const [packages] = await connection.query<PackageRow[]>(
        'SELECT * FROM paquetes WHERE sede_id = ? AND codigo_paquete = ? LIMIT 1 FOR UPDATE',
        [sedeId, code],
      );
      const packageItem = packages[0];

      if (!packageItem) {
        await recordIncident(connection, code, 'NO_EXISTE', userId, sedeId);
        return { status: 404, body: { ok: false, estado: 'NO EXISTE', message: 'El paquete no existe en el sistema.' } };
      }

      if (packageItem.lote_importacion !== activeLot) {
        await recordIncident(connection, code, 'OTRO_LOTE', userId, sedeId);
        return {
          status: 422,
          body: {
            ok: false,
            estado: 'OTRO_LOTE',
            message: `El paquete pertenece a otro lote: "${packageItem.lote_importacion}".`,
            data: packageItem,
          },
        };
      }

      if (packageItem.estado === 'LLEGÓ') {
        await recordIncident(connection, code, 'DUPLICADO', userId, sedeId);
        const [users] = await connection.query<UserNameRow[]>(
          'SELECT nombre FROM usuarios WHERE id = ? LIMIT 1',
          [packageItem.usuario_id_escaneo],
        );
        const operator = users[0]?.nombre || 'otro operador';
        const scannedAt = packageItem.fecha_escaneo
          ? new Date(packageItem.fecha_escaneo).toLocaleString('es-PE')
          : 'una fecha no disponible';
        return {
          status: 409,
          body: {
            ok: false,
            estado: 'DUPLICADO',
            message: `Este código ya fue escaneado por ${operator} el ${scannedAt}.`,
            data: packageItem,
          },
        };
      }

      await connection.query<ResultSetHeader>(
        `UPDATE paquetes
            SET estado = 'LLEGÓ', fecha_escaneo = NOW(), usuario_id_escaneo = ?, sede_id_escaneo = ?
          WHERE id = ? AND sede_id = ? AND estado = 'PENDIENTE'`,
        [userId, sedeId, packageItem.id, sedeId],
      );
      const [updated] = await connection.query<PackageRow[]>(
        'SELECT * FROM paquetes WHERE id = ? AND sede_id = ? LIMIT 1',
        [packageItem.id, sedeId],
      );
      return {
        status: 200,
        body: { ok: true, estado: 'LLEGÓ', message: 'Paquete registrado con éxito.', data: updated[0] },
      };
    });

    return res.status(outcome.status).json(outcome.body);
  } catch (error) {
    return internalError(res, 'procesar el escaneo', error);
  }
};

export const importarPaquetes = async (req: AuthRequest, res: Response) => {
  const lot = cleanSavarText(req.body?.lote_importacion, 120);
  if (!lot) return res.status(400).json({ ok: false, message: 'El nombre del lote es obligatorio.' });
  if (!Array.isArray(req.body?.paquetes) || req.body.paquetes.length === 0) {
    return res.status(400).json({ ok: false, message: 'Debe proporcionar una lista de paquetes.' });
  }
  if (req.body.paquetes.length > MAX_SAVAR_IMPORT_ROWS) {
    return res.status(413).json({ ok: false, message: `Cada importación admite hasta ${MAX_SAVAR_IMPORT_ROWS} filas.` });
  }
  const sedeId = requireSede(req, res);
  if (!sedeId) return;

  const parsed = parseSavarImportRows(req.body.paquetes);
  if (!parsed.rows.length) {
    return res.status(400).json({ ok: false, message: 'Ninguna fila contiene código y consignado válidos.' });
  }

  try {
    await runInTransaction(async connection => {
      for (let offset = 0; offset < parsed.rows.length; offset += IMPORT_CHUNK_SIZE) {
        const chunk = parsed.rows.slice(offset, offset + IMPORT_CHUNK_SIZE).map(item => [
          sedeId, item.codigo, item.consignado, item.direccion, item.telefono, item.departamento,
          item.provincia, item.distrito, lot, 'PENDIENTE',
        ]);
        await connection.query<ResultSetHeader>(
          `INSERT INTO paquetes
            (sede_id, codigo_paquete, consignado, direccion, telefono, departamento, provincia, distrito, lote_importacion, estado)
           VALUES ?
           ON DUPLICATE KEY UPDATE
             consignado = VALUES(consignado), direccion = VALUES(direccion), telefono = VALUES(telefono),
             departamento = VALUES(departamento), provincia = VALUES(provincia), distrito = VALUES(distrito),
             lote_importacion = IF(estado = 'PENDIENTE', VALUES(lote_importacion), lote_importacion)`,
          [chunk],
        );
      }
    });

    const ignored = parsed.invalid + parsed.duplicates;
    return res.status(200).json({
      ok: true,
      message: `${parsed.rows.length} paquetes procesados en el lote "${lot}"${ignored ? `; ${ignored} filas inválidas o repetidas fueron omitidas` : ''}.`,
      data: { processed: parsed.rows.length, invalid: parsed.invalid, duplicates: parsed.duplicates },
    });
  } catch (error) {
    return internalError(res, 'importar los paquetes', error);
  }
};

export const listarPaquetes = async (req: AuthRequest, res: Response) => {
  const sedeId = requireSede(req, res);
  if (!sedeId) return;

  const status = cleanSavarText(req.query.estado, 20).toUpperCase();
  const lot = cleanSavarText(req.query.lote_importacion, 120);
  const search = cleanSavarText(req.query.q, 100);
  const requestedLimit = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_LIST_ROWS) : 100;
  const scope = savarSedeScope('p', sedeId);
  const conditions: string[] = [scope.where];
  const params: Array<string | number> = [...scope.params];

  if (status === 'LLEGÓ') {
    conditions.push(`p.estado = 'LLEGÓ'`);
  } else if (status === 'PENDIENTE') {
    conditions.push(`p.estado = 'PENDIENTE'`);
  }
  if (lot) {
    conditions.push('p.lote_importacion = ?');
    params.push(lot);
  }
  if (search) {
    conditions.push('(p.codigo_paquete LIKE ? OR p.consignado LIKE ? OR p.telefono LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  try {
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.query<PackageRow[]>(
      `SELECT p.*, u.nombre AS operador_escaneo_nombre, s.nombre AS sede_escaneo_nombre
         FROM paquetes p
         LEFT JOIN usuarios u ON u.id = p.usuario_id_escaneo
         LEFT JOIN sedes s ON s.id = p.sede_id_escaneo
         ${where}
        ORDER BY p.updated_at DESC
        LIMIT ?`,
      [...params, limit],
    );
    return res.status(200).json({ ok: true, data: rows });
  } catch (error) {
    return internalError(res, 'listar los paquetes', error);
  }
};

export const listarLotes = async (req: AuthRequest, res: Response) => {
  const sedeId = requireSede(req, res);
  if (!sedeId) return;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT lote_importacion AS nombre, MIN(created_at) AS fecha_creacion, COUNT(*) AS total,
              SUM(CASE WHEN estado = 'LLEGÓ' AND sede_id_escaneo = ? THEN 1 ELSE 0 END) AS recibidos,
              SUM(CASE WHEN estado = 'PENDIENTE' THEN 1 ELSE 0 END) AS pendientes
         FROM paquetes
        WHERE sede_id = ?
        GROUP BY lote_importacion
        ORDER BY fecha_creacion DESC`,
      [sedeId, sedeId],
    );
    return res.status(200).json({ ok: true, data: rows });
  } catch (error) {
    return internalError(res, 'listar los lotes', error);
  }
};

export const listarFaltantes = async (req: AuthRequest, res: Response) => {
  const sedeId = requireSede(req, res);
  if (!sedeId) return;
  const lot = cleanSavarText(req.query.lote, 120);
  if (!lot) return res.status(400).json({ ok: false, message: 'El parámetro "lote" es obligatorio.' });
  try {
    const [rows] = await pool.query<PackageRow[]>(
      `SELECT id, codigo_paquete, consignado, direccion, distrito, telefono, estado, lote_importacion
         FROM paquetes
        WHERE sede_id = ? AND lote_importacion = ? AND estado = 'PENDIENTE'
        ORDER BY consignado ASC`,
      [sedeId, lot],
    );
    return res.status(200).json({ ok: true, data: rows });
  } catch (error) {
    return internalError(res, 'listar los paquetes faltantes', error);
  }
};

export const restablecerEscaneos = async (req: AuthRequest, res: Response) => {
  const sedeId = requireSede(req, res);
  if (!sedeId) return;
  const lot = cleanSavarText(req.query.lote, 120);

  try {
    const affected = await runInTransaction(async connection => {
      const params: Array<string | number> = [sedeId];
      const lotCondition = lot ? ' AND lote_importacion = ?' : '';
      if (lot) params.push(lot);
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE paquetes
            SET estado = 'PENDIENTE', fecha_escaneo = NULL, usuario_id_escaneo = NULL, sede_id_escaneo = NULL
          WHERE sede_id = ?${lotCondition}`,
        params,
      );

      if (lot) {
        await connection.query<ResultSetHeader>(
          `DELETE audit FROM paquetes_auditoria audit
            INNER JOIN paquetes package_item ON package_item.codigo_paquete = audit.codigo_escaneado
           WHERE audit.sede_id = ? AND package_item.sede_id = ? AND package_item.lote_importacion = ?`,
          [sedeId, sedeId, lot],
        );
      } else {
        await connection.query<ResultSetHeader>('DELETE FROM paquetes_auditoria WHERE sede_id = ?', [sedeId]);
      }
      return result.affectedRows;
    });
    return res.status(200).json({ ok: true, message: `${affected} paquetes fueron restablecidos correctamente.` });
  } catch (error) {
    return internalError(res, 'restablecer los escaneos', error);
  }
};

export const eliminarLote = async (req: AuthRequest, res: Response) => {
  const sedeId = requireSede(req, res);
  if (!sedeId) return;
  const lot = cleanSavarText(req.params.nombre, 120);
  if (!lot) return res.status(400).json({ ok: false, message: 'Debe especificar el lote a eliminar.' });

  try {
    const affected = await runInTransaction(async connection => {
      await connection.query<ResultSetHeader>(
        `DELETE audit FROM paquetes_auditoria audit
          INNER JOIN paquetes package_item ON audit.codigo_escaneado = package_item.codigo_paquete
         WHERE package_item.sede_id = ? AND package_item.lote_importacion = ? AND audit.sede_id = ?`,
        [sedeId, lot, sedeId],
      );
      const [result] = await connection.query<ResultSetHeader>(
        'DELETE FROM paquetes WHERE sede_id = ? AND lote_importacion = ?',
        [sedeId, lot],
      );
      return result.affectedRows;
    });
    if (!affected) return res.status(404).json({ ok: false, message: `No existe el lote "${lot}".` });
    return res.status(200).json({ ok: true, message: `El lote "${lot}" y sus ${affected} paquetes fueron eliminados.` });
  } catch (error) {
    return internalError(res, 'eliminar el lote', error);
  }
};
