// ============================================================
// backend/src/modules/gps/repositories/mysql/MySqlGpsRepository.ts
// Implementación del repositorio de GPS para MySQL/MariaDB
// ============================================================

import { pool } from '../../../../core/database/database';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export class MySqlGpsRepository {

  async obtenerSedeEmpleado(empleadoId: number): Promise<number | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT sede_id FROM personal_empleados WHERE id = ? LIMIT 1',
      [empleadoId]
    );
    return rows.length ? Number(rows[0].sede_id) : null;
  }
  
  /**
   * Registra la ubicación GPS actual en tiempo real y también en el historial histórico
   * utilizando una transacción atómica para asegurar la consistencia.
   */
  async registrarUbicacion(params: {
    empleadoId: number;
    latitud: number;
    longitud: number;
    velocidadKmh: number;
    precisionGps: number | null;
    altitud: number | null;
    rumbo: number | null;
    estadoMovimiento: 'DETENIDO' | 'CAMINANDO' | 'VEHICULO';
    porcentajeBateria: number | null;
    registradoEn: Date;
  }): Promise<void> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Insertar o actualizar la ubicación en tiempo real (UPSERT nativo)
      await connection.query(
        `INSERT INTO personal_gps_tiempo_real (
          empleado_id, latitud, longitud, velocidad_kmh, precision_gps, 
          altitud, rumbo, estado_movimiento, porcentaje_bateria, ultima_actualizacion
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          latitud = VALUES(latitud),
          longitud = VALUES(longitud),
          velocidad_kmh = VALUES(velocidad_kmh),
          precision_gps = VALUES(precision_gps),
          altitud = VALUES(altitud),
          rumbo = VALUES(rumbo),
          estado_movimiento = VALUES(estado_movimiento),
          porcentaje_bateria = VALUES(porcentaje_bateria),
          ultima_actualizacion = VALUES(ultima_actualizacion)`,
        [
          params.empleadoId,
          params.latitud,
          params.longitud,
          params.velocidadKmh,
          params.precisionGps,
          params.altitud,
          params.rumbo,
          params.estadoMovimiento,
          params.porcentajeBateria,
          params.registradoEn
        ]
      );

      // 2. Insertar en el historial histórico
      await connection.query(
        `INSERT INTO personal_gps_historial (
          empleado_id, latitud, longitud, velocidad_kmh, precision_gps, 
          altitud, rumbo, estado_movimiento, porcentaje_bateria, registrado_en
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          params.empleadoId,
          params.latitud,
          params.longitud,
          params.velocidadKmh,
          params.precisionGps,
          params.altitud,
          params.rumbo,
          params.estadoMovimiento,
          params.porcentajeBateria,
          params.registradoEn
        ]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Obtiene la ubicación en tiempo real de todos los empleados activos de una sede específica
   */
  async obtenerTiempoRealPorSede(sedeId: number | null): Promise<any[]> {
    const siteFilter = sedeId === null ? '' : 'AND e.sede_id = ?';
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT tr.empleado_id, tr.latitud, tr.longitud, tr.velocidad_kmh, tr.precision_gps, 
              tr.altitud, tr.rumbo, tr.estado_movimiento, tr.porcentaje_bateria, tr.ultima_actualizacion,
              e.codigo_empleado, e.nombres, e.apellidos, e.sede_id, s.nombre AS sede_nombre,
              c.nombre AS cargo_nombre
       FROM personal_gps_tiempo_real tr
       INNER JOIN personal_empleados e ON tr.empleado_id = e.id
       INNER JOIN personal_cargos c ON e.cargo_id = c.id
       INNER JOIN sedes s ON e.sede_id = s.id
       WHERE e.estado = 'ACTIVO' AND e.tipo_rastreo = 'CONTINUO' ${siteFilter}
       ORDER BY tr.ultima_actualizacion DESC`,
      sedeId === null ? [] : [sedeId]
    );

    return rows;
  }

  /**
   * Obtiene el recorrido histórico de un empleado específico en una fecha determinada (ordenado por hora)
   */
  async obtenerHistorialEmpleado(empleadoId: number, fecha: string): Promise<any[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT latitud, longitud, velocidad_kmh, precision_gps, altitud, rumbo, 
              estado_movimiento, porcentaje_bateria, registrado_en
       FROM personal_gps_historial
       WHERE empleado_id = ? AND DATE(registrado_en) = ?
       ORDER BY registrado_en ASC`,
      [empleadoId, fecha]
    );

    return rows;
  }
}
