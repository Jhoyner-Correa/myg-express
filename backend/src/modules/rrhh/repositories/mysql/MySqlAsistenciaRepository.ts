// ============================================================
// backend/src/modules/rrhh/repositories/mysql/MySqlAsistenciaRepository.ts
// Implementación del repositorio de asistencia para MySQL/MariaDB
// ============================================================

import { pool } from '../../../../core/database/database';
import { Asistencia, AttendanceStatus, AttendanceType } from '../../domain/Asistencia';
import { IAsistenciaRepository } from '../IAsistenciaRepository';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export class MySqlAsistenciaRepository implements IAsistenciaRepository {
  
  private mapRowToEntity(row: any): Asistencia {
    return {
      id: row.id,
      empleadoId: row.empleado_id,
      fecha: new Date(row.fecha),
      estadoAsistencia: row.estado_asistencia as AttendanceStatus,
      tipoAsistencia: row.tipo_asistencia as AttendanceType,
      minutosTardanza: Number(row.minutos_tardanza || 0),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async obtenerPorEmpleadoYFecha(empleadoId: number, fecha: string): Promise<Asistencia | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, empleado_id, fecha, estado_asistencia, tipo_asistencia, minutos_tardanza, created_at, updated_at
       FROM personal_asistencias
       WHERE empleado_id = ? AND fecha = ?
       LIMIT 1`,
      [empleadoId, fecha]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async obtenerPorId(id: number): Promise<Asistencia | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, empleado_id, fecha, estado_asistencia, tipo_asistencia, minutos_tardanza, created_at, updated_at
       FROM personal_asistencias
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async crear(a: Omit<Asistencia, 'id'>): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO personal_asistencias (
        empleado_id, fecha, estado_asistencia, tipo_asistencia, minutos_tardanza
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        a.empleadoId,
        a.fecha instanceof Date ? a.fecha.toISOString().slice(0, 10) : a.fecha,
        a.estadoAsistencia,
        a.tipoAsistencia,
        a.minutosTardanza
      ]
    );

    return result.insertId;
  }

  async actualizar(id: number, datos: Partial<Omit<Asistencia, 'id'>>): Promise<boolean> {
    const fields: string[] = [];
    const params: any[] = [];

    if (datos.empleadoId !== undefined) {
      fields.push('empleado_id = ?');
      params.push(datos.empleadoId);
    }
    if (datos.fecha !== undefined) {
      fields.push('fecha = ?');
      params.push(datos.fecha instanceof Date ? datos.fecha.toISOString().slice(0, 10) : datos.fecha);
    }
    if (datos.estadoAsistencia !== undefined) {
      fields.push('estado_asistencia = ?');
      params.push(datos.estadoAsistencia);
    }
    if (datos.tipoAsistencia !== undefined) {
      fields.push('tipo_asistencia = ?');
      params.push(datos.tipoAsistencia);
    }
    if (datos.minutosTardanza !== undefined) {
      fields.push('minutos_tardanza = ?');
      params.push(datos.minutosTardanza);
    }

    if (fields.length === 0) return false;

    params.push(id);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE personal_asistencias SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    return result.affectedRows > 0;
  }

  async listarPorSedeYFecha(
    sedeId: number,
    fecha: string
  ): Promise<(Asistencia & { codigoEmpleado: string; nombres: string; apellidos: string; cargoNombre: string })[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT a.id, a.empleado_id, a.fecha, a.estado_asistencia, a.tipo_asistencia, a.minutos_tardanza, a.created_at, a.updated_at,
              e.codigo_empleado, e.nombres, e.apellidos,
              c.nombre AS cargo_nombre
       FROM personal_asistencias a
       INNER JOIN personal_empleados e ON a.empleado_id = e.id
       INNER JOIN personal_cargos c ON e.cargo_id = c.id
       WHERE e.sede_id = ? AND a.fecha = ?
       ORDER BY e.apellidos ASC, e.nombres ASC`,
      [sedeId, fecha]
    );

    return rows.map(row => {
      const entity = this.mapRowToEntity(row);
      return {
        ...entity,
        codigoEmpleado: row.codigo_empleado,
        nombres: row.nombres,
        apellidos: row.apellidos,
        cargoNombre: row.cargo_nombre
      };
    });
  }
}
