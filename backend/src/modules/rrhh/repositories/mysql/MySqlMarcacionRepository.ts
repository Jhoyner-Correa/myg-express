// ============================================================
// backend/src/modules/rrhh/repositories/mysql/MySqlMarcacionRepository.ts
// Implementación del repositorio de marcaciones para MySQL/MariaDB
// ============================================================

import { pool } from '../../../../core/database/database';
import { Marcacion, ClockType, ClockOrigin } from '../../domain/Marcacion';
import { IMarcacionRepository } from '../IMarcacionRepository';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export class MySqlMarcacionRepository implements IMarcacionRepository {
  
  private mapRowToEntity(row: any): Marcacion {
    return {
      id: row.id,
      asistenciaId: row.asistencia_id,
      dispositivoId: row.dispositivo_id,
      tipoMarcacion: row.tipo_marcacion as ClockType,
      origenMarcacion: row.origen_marcacion as ClockOrigin,
      horaMarcacion: new Date(row.hora_marcacion),
      latitud: Number(row.latitud),
      longitud: Number(row.longitud),
      precisionGps: row.precision_gps ? Number(row.precision_gps) : null,
      selfiePath: row.selfie_path || null,
      redWifi: row.red_wifi || null,
      bluetooth: row.bluetooth || null,
      dentroDeRadio: Boolean(row.dentro_de_radio),
      createdAt: new Date(row.created_at)
    };
  }

  async crear(m: Omit<Marcacion, 'id'>): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO personal_marcaciones (
        asistencia_id, dispositivo_id, tipo_marcacion, origen_marcacion, 
        hora_marcacion, latitud, longitud, precision_gps, 
        selfie_path, red_wifi, bluetooth, dentro_de_radio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.asistenciaId,
        m.dispositivoId,
        m.tipoMarcacion,
        m.origenMarcacion,
        m.horaMarcacion, // MySQL acepta objeto Date de JS directamente en mysql2
        m.latitud,
        m.longitud,
        m.precisionGps,
        m.selfiePath,
        m.redWifi,
        m.bluetooth,
        m.dentroDeRadio ? 1 : 0
      ]
    );

    return result.insertId;
  }

  async obtenerPorAsistencia(asistenciaId: number): Promise<Marcacion[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, asistencia_id, dispositivo_id, tipo_marcacion, origen_marcacion, 
              hora_marcacion, latitud, longitud, precision_gps, 
              selfie_path, red_wifi, bluetooth, dentro_de_radio, created_at
       FROM personal_marcaciones
       WHERE asistencia_id = ?
       ORDER BY hora_marcacion ASC`,
      [asistenciaId]
    );

    return rows.map(row => this.mapRowToEntity(row));
  }
}
