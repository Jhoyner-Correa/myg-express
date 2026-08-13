import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../../core/database/database';
import { ClockOrigin, ClockType, IdentityVerification, Marcacion } from '../../domain/Marcacion';
import { IMarcacionRepository } from '../IMarcacionRepository';

const SELECT_COLUMNS = `id, request_id, asistencia_id, dispositivo_id, tipo_marcacion, origen_marcacion,
  hora_marcacion, latitud, longitud, precision_gps, selfie_path, red_wifi, bluetooth,
  dentro_de_radio, distancia_sede_metros, verificacion_identidad, created_at`;

export class MySqlMarcacionRepository implements IMarcacionRepository {
  private mapRowToEntity(row: any): Marcacion {
    return {
      id: Number(row.id),
      requestId: String(row.request_id),
      asistenciaId: Number(row.asistencia_id),
      dispositivoId: row.dispositivo_id === null ? null : Number(row.dispositivo_id),
      tipoMarcacion: row.tipo_marcacion as ClockType,
      origenMarcacion: row.origen_marcacion as ClockOrigin,
      horaMarcacion: new Date(row.hora_marcacion),
      latitud: Number(row.latitud),
      longitud: Number(row.longitud),
      precisionGps: row.precision_gps === null ? null : Number(row.precision_gps),
      selfiePath: row.selfie_path || null,
      redWifi: row.red_wifi || null,
      bluetooth: row.bluetooth || null,
      dentroDeRadio: Boolean(row.dentro_de_radio),
      distanciaSedeMetros: Number(row.distancia_sede_metros),
      verificacionIdentidad: row.verificacion_identidad as IdentityVerification,
      createdAt: new Date(row.created_at),
    };
  }

  async crear(mark: Omit<Marcacion, 'id'>, connection?: PoolConnection): Promise<number> {
    const executor = connection ?? pool;
    const [result] = await executor.query<ResultSetHeader>(
      `INSERT INTO personal_marcaciones (
        request_id, asistencia_id, dispositivo_id, tipo_marcacion, origen_marcacion,
        hora_marcacion, latitud, longitud, precision_gps, selfie_path, red_wifi,
        bluetooth, dentro_de_radio, distancia_sede_metros, verificacion_identidad
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mark.requestId,
        mark.asistenciaId,
        mark.dispositivoId,
        mark.tipoMarcacion,
        mark.origenMarcacion,
        mark.horaMarcacion,
        mark.latitud,
        mark.longitud,
        mark.precisionGps,
        mark.selfiePath,
        mark.redWifi,
        mark.bluetooth,
        mark.dentroDeRadio ? 1 : 0,
        mark.distanciaSedeMetros,
        mark.verificacionIdentidad,
      ],
    );
    return result.insertId;
  }

  async obtenerPorAsistencia(asistenciaId: number, connection?: PoolConnection): Promise<Marcacion[]> {
    const executor = connection ?? pool;
    const [rows] = await executor.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLUMNS}
         FROM personal_marcaciones
        WHERE asistencia_id = ?
        ORDER BY hora_marcacion ASC, id ASC`,
      [asistenciaId],
    );
    return rows.map(row => this.mapRowToEntity(row));
  }

  async obtenerPorRequestId(requestId: string, connection?: PoolConnection): Promise<Marcacion | null> {
    const executor = connection ?? pool;
    const [rows] = await executor.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLUMNS}
         FROM personal_marcaciones
        WHERE request_id = ?
        LIMIT 1`,
      [requestId],
    );
    return rows.length ? this.mapRowToEntity(rows[0]) : null;
  }
}
