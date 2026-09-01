import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { Geofence, assertGeofenceDefinition } from '../domain/attendancePolicy';

type GeofenceRow = RowDataPacket & {
  sede_id: number;
  latitud: string;
  longitud: string;
  radio_permitido_metros: number;
  precision_maxima_metros: string;
  updated_at: Date;
};

export class GeofenceService {
  async list(scopedSiteId: number | null, companyId: number | null) {
    const [rows] = await pool.query<(GeofenceRow & { site_name: string })[]>(
      `SELECT gps.sede_id, site.nombre AS site_name, gps.latitud, gps.longitud,
              gps.radio_permitido_metros, gps.precision_maxima_metros, gps.updated_at
         FROM personal_configuracion_gps_sedes gps
         INNER JOIN sedes site ON site.id = gps.sede_id
        WHERE site.estado = 'activo'
          AND (? IS NULL OR site.id = ?)
          AND (? IS NULL OR site.empresa_id = ?)
        ORDER BY site.nombre ASC`,
      [scopedSiteId, scopedSiteId, companyId, companyId],
    );
    return rows.map(row => ({
      site_id: Number(row.sede_id),
      site_name: String(row.site_name),
      latitude: Number(row.latitud),
      longitude: Number(row.longitud),
      radius_meters: Number(row.radio_permitido_metros),
      maximum_accuracy_meters: Number(row.precision_maxima_metros),
      updated_at: row.updated_at,
    }));
  }

  async getBySite(siteId: number) {
    const [rows] = await pool.query<GeofenceRow[]>(
      `SELECT sede_id, latitud, longitud, radio_permitido_metros,
              precision_maxima_metros, updated_at
         FROM personal_configuracion_gps_sedes
        WHERE sede_id = ? LIMIT 1`,
      [siteId],
    );
    if (!rows.length) return null;
    return {
      site_id: Number(rows[0].sede_id),
      latitude: Number(rows[0].latitud),
      longitude: Number(rows[0].longitud),
      radius_meters: Number(rows[0].radio_permitido_metros),
      maximum_accuracy_meters: Number(rows[0].precision_maxima_metros),
      updated_at: rows[0].updated_at,
    };
  }

  async upsert(
    siteId: number,
    value: Geofence,
    actorUserId: number,
    ipAddress?: string | null,
    capture?: { method: 'MANUAL' | 'DEVICE_GPS'; accuracyMeters: number | null },
  ) {
    assertGeofenceDefinition(value);
    await runInTransaction(async connection => {
      const [siteRows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM sedes WHERE id = ? AND estado = \'activo\' LIMIT 1',
        [siteId],
      );
      if (!siteRows.length) throw new Error('Sede activa no encontrada.');
      await connection.query<ResultSetHeader>(
        `INSERT INTO personal_configuracion_gps_sedes (
          sede_id, latitud, longitud, radio_permitido_metros, precision_maxima_metros
        ) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE latitud = VALUES(latitud), longitud = VALUES(longitud),
          radio_permitido_metros = VALUES(radio_permitido_metros),
          precision_maxima_metros = VALUES(precision_maxima_metros)`,
        [siteId, value.latitude, value.longitude, value.radiusMeters, value.maximumAccuracyMeters],
      );
      await connection.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, usuario_id, exitoso, codigo_resultado, ip_address, metadata_json
        ) VALUES ('CONFIGURACION_GEOCERCA', ?, 1, 'ACTUALIZADA', ?, ?)`,
        [actorUserId, ipAddress || null, JSON.stringify({ site_id: siteId, ...value, capture: capture ?? null })],
      );
    });
    return this.getBySite(siteId);
  }
}
