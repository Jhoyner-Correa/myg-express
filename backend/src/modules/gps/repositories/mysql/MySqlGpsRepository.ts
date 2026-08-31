// ============================================================
// backend/src/modules/gps/repositories/mysql/MySqlGpsRepository.ts
// Implementación del repositorio de GPS para MySQL/MariaDB
// ============================================================

import { pool } from '../../../../core/database/database';
import { RowDataPacket } from 'mysql2/promise';

export class MySqlGpsRepository {

  async obtenerSedeEmpleado(empleadoId: number): Promise<number | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT sede_id FROM personal_empleados WHERE id = ? LIMIT 1',
      [empleadoId]
    );
    return rows.length ? Number(rows[0].sede_id) : null;
  }

  async empleadoTieneRastreoContinuo(empleadoId: number): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1
         FROM personal_empleados
        WHERE id = ? AND estado = 'ACTIVO' AND tipo_rastreo = 'CONTINUO'
        LIMIT 1`,
      [empleadoId]
    );
    return rows.length > 0;
  }

  async empleadoTieneJornadaActiva(
    empleadoId: number,
    fechaOperativa: string,
    capturadoEn: string,
  ): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1
         FROM personal_asistencias attendance
        WHERE attendance.empleado_id = ? AND attendance.fecha = ?
          AND EXISTS (
            SELECT 1 FROM personal_marcaciones mark_entry
             WHERE mark_entry.asistencia_id = attendance.id
               AND mark_entry.tipo_marcacion = 'ENTRADA'
               AND mark_entry.hora_marcacion <= ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM personal_marcaciones mark_exit
             WHERE mark_exit.asistencia_id = attendance.id
               AND mark_exit.tipo_marcacion = 'SALIDA'
               AND mark_exit.hora_marcacion < ?
          )
        LIMIT 1`,
      [empleadoId, fechaOperativa, capturadoEn, capturadoEn],
    );
    return rows.length > 0;
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

      const [previousRows] = await connection.query<RowDataPacket[]>(
        `SELECT latitud, longitud, estado_movimiento, registrado_en
           FROM personal_gps_historial
          WHERE empleado_id = ?
          ORDER BY registrado_en DESC, id DESC
          LIMIT 1 FOR UPDATE`,
        [params.empleadoId],
      );

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

      // El tiempo real se refresca siempre. El historial conserva cambios
      // significativos o un punto de control cada dos minutos.
      const previous = previousRows[0];
      const elapsedSeconds = previous
        ? Math.max(0, (params.registradoEn.getTime() - new Date(previous.registrado_en).getTime()) / 1000)
        : Number.POSITIVE_INFINITY;
      const distanceMeters = previous
        ? haversineMeters(
          Number(previous.latitud),
          Number(previous.longitud),
          params.latitud,
          params.longitud,
        )
        : Number.POSITIVE_INFINITY;
      const shouldPersistHistory = !previous
        || elapsedSeconds >= 120
        || distanceMeters >= 15
        || String(previous.estado_movimiento) !== params.estadoMovimiento;

      if (shouldPersistHistory) {
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
            params.registradoEn,
          ],
        );
      }

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
  async obtenerTiempoRealPorSede(sedeId: number | null, fechaOperativa: string): Promise<any[]> {
    const siteFilter = sedeId === null ? '' : 'AND e.sede_id = ?';
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id AS empleado_id, tr.latitud, tr.longitud, tr.velocidad_kmh, tr.precision_gps,
              tr.altitud, tr.rumbo, tr.estado_movimiento, tr.porcentaje_bateria, tr.ultima_actualizacion,
              e.codigo_empleado, e.nombres, e.apellidos, e.sexo, e.foto, e.sede_id,
              s.nombre AS sede_nombre, c.nombre AS cargo_nombre,
              CASE
                WHEN marks.entrada_en IS NULL THEN 'SIN_INICIAR'
                WHEN marks.salida_en IS NOT NULL THEN 'FINALIZADA'
                ELSE 'EN_JORNADA'
              END AS estado_jornada
       FROM personal_empleados e
       INNER JOIN personal_cargos c ON e.cargo_id = c.id
       INNER JOIN sedes s ON e.sede_id = s.id
       LEFT JOIN personal_gps_tiempo_real tr ON tr.empleado_id = e.id
       LEFT JOIN personal_asistencias attendance
         ON attendance.empleado_id = e.id AND attendance.fecha = ?
       LEFT JOIN (
         SELECT asistencia_id,
                MAX(CASE WHEN tipo_marcacion = 'ENTRADA' THEN hora_marcacion END) AS entrada_en,
                MAX(CASE WHEN tipo_marcacion = 'SALIDA' THEN hora_marcacion END) AS salida_en
           FROM personal_marcaciones
          GROUP BY asistencia_id
       ) marks ON marks.asistencia_id = attendance.id
       WHERE e.estado = 'ACTIVO' AND e.tipo_rastreo = 'CONTINUO' ${siteFilter}
       ORDER BY (marks.entrada_en IS NOT NULL AND marks.salida_en IS NULL) DESC,
                tr.ultima_actualizacion DESC, e.apellidos, e.nombres`,
      sedeId === null ? [fechaOperativa] : [fechaOperativa, sedeId]
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

function haversineMeters(latA: number, lonA: number, latB: number, lonB: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusMeters = 6_371_000;
  const deltaLat = radians(latB - latA);
  const deltaLon = radians(lonB - lonA);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(deltaLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
