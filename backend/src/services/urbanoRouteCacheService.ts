import { RowDataPacket } from 'mysql2';
import { pool } from '../core/database/database';

export type UrbanoRouteCachePayload = {
  routeId: string;
  totalGuias: number;
  totalRegistros: number;
  records: unknown[];
};

type CacheRow = RowDataPacket & {
  usuario_id: number;
  sede_id: number | null;
  route_id: string;
  total_guias: number;
  total_registros: number;
  payload_json: string;
  expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
};

const DEFAULT_TTL_MINUTES = 45;

function getCacheTtlMinutes() {
  const value = Number(process.env.URBANO_ROUTE_CACHE_TTL_MINUTES || DEFAULT_TTL_MINUTES);
  if (!Number.isFinite(value)) return DEFAULT_TTL_MINUTES;
  return Math.min(Math.max(Math.floor(value), 5), 240);
}

function parsePayload(payload: string): UrbanoRouteCachePayload | null {
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || !Array.isArray(parsed.records)) return null;
    return {
      routeId: String(parsed.routeId || ''),
      totalGuias: Number(parsed.totalGuias || 0),
      totalRegistros: Number(parsed.totalRegistros || parsed.records.length || 0),
      records: parsed.records
    };
  } catch {
    return null;
  }
}

export async function saveUrbanoRouteCache(params: {
  usuarioId: number;
  sedeId: number | null;
  routeId: string;
  payload: UrbanoRouteCachePayload;
}) {
  const ttlMinutes = getCacheTtlMinutes();
  const payloadJson = JSON.stringify(params.payload);

  await pool.query(
    `INSERT INTO urbano_route_cache
      (usuario_id, sede_id, route_id, total_guias, total_registros, payload_json, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ${ttlMinutes} MINUTE))
     ON DUPLICATE KEY UPDATE
      sede_id = VALUES(sede_id),
      route_id = VALUES(route_id),
      total_guias = VALUES(total_guias),
      total_registros = VALUES(total_registros),
      payload_json = VALUES(payload_json),
      expires_at = VALUES(expires_at),
      updated_at = CURRENT_TIMESTAMP`,
    [
      params.usuarioId,
      params.sedeId,
      params.routeId,
      Number(params.payload.totalGuias || 0),
      Number(params.payload.totalRegistros || params.payload.records?.length || 0),
      payloadJson
    ]
  );

  return { ttlMinutes };
}

export async function getLatestUrbanoRouteCache(usuarioId: number) {
  await deleteExpiredUrbanoRouteCache();

  const [rows] = await pool.query<CacheRow[]>(
    `SELECT
        usuario_id,
        sede_id,
        route_id,
        total_guias,
        total_registros,
        payload_json,
        expires_at,
        created_at,
        updated_at
     FROM urbano_route_cache
     WHERE usuario_id = ?
       AND expires_at > NOW()
     LIMIT 1`,
    [usuarioId]
  );

  if (!rows.length) return null;

  const row = rows[0];
  const payload = parsePayload(row.payload_json);
  if (!payload) {
    await clearUrbanoRouteCache(usuarioId);
    return null;
  }

  return {
    usuarioId: row.usuario_id,
    sedeId: row.sede_id,
    routeId: row.route_id,
    totalGuias: row.total_guias,
    totalRegistros: row.total_registros,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    result: payload
  };
}

export async function clearUrbanoRouteCache(usuarioId: number) {
  await pool.query('DELETE FROM urbano_route_cache WHERE usuario_id = ?', [usuarioId]);
}

export async function deleteExpiredUrbanoRouteCache() {
  await pool.query('DELETE FROM urbano_route_cache WHERE expires_at <= NOW()');
}
