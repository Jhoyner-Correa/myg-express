// ============================================================
// backend/src/modules/rrhh/repositories/mysql/MySqlEmpleadoRepository.ts
// Implementación del repositorio de empleados para MySQL/MariaDB
// ============================================================

import { pool } from '../../../../core/database/database';
import { Empleado, EmployeeGender, EmployeeTracking, EmployeeStatus } from '../../domain/Empleado';
import { IEmpleadoRepository } from '../IEmpleadoRepository';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export class MySqlEmpleadoRepository implements IEmpleadoRepository {
  
  private mapRowToEntity(row: any): Empleado {
    return {
      id: row.id,
      codigoEmpleado: row.codigo_empleado,
      sedeId: row.sede_id,
      cargoId: row.cargo_id,
      dni: row.dni,
      nombres: row.nombres,
      apellidos: row.apellidos,
      sexo: row.sexo as EmployeeGender,
      telefono: row.telefono || null,
      email: row.email || null,
      foto: row.foto || null,
      fechaIngreso: new Date(row.fecha_ingreso),
      fechaCese: row.fecha_cese ? new Date(row.fecha_cese) : null,
      tipoRastreo: row.tipo_rastreo as EmployeeTracking,
      estado: row.estado as EmployeeStatus,
      observaciones: row.observaciones || null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async buscarPorId(id: number): Promise<Empleado | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, sexo, telefono, email, foto, fecha_ingreso, fecha_cese, tipo_rastreo, estado, observaciones, created_at, updated_at
       FROM personal_empleados
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async buscarPorCodigo(codigo: string): Promise<Empleado | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, sexo, telefono, email, foto, fecha_ingreso, fecha_cese, tipo_rastreo, estado, observaciones, created_at, updated_at
       FROM personal_empleados
       WHERE codigo_empleado = ?
       LIMIT 1`,
      [codigo]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async buscarPorDni(dni: string): Promise<Empleado | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, sexo, telefono, email, foto, fecha_ingreso, fecha_cese, tipo_rastreo, estado, observaciones, created_at, updated_at
       FROM personal_empleados
       WHERE dni = ?
       LIMIT 1`,
      [dni]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async crear(e: Omit<Empleado, 'id'>): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO personal_empleados (
        codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, 
        sexo, telefono, email, foto, fecha_ingreso, fecha_cese, 
        tipo_rastreo, estado, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.codigoEmpleado,
        e.sedeId,
        e.cargoId,
        e.dni,
        e.nombres,
        e.apellidos,
        e.sexo,
        e.telefono,
        e.email,
        e.foto,
        e.fechaIngreso.toISOString().slice(0, 10), // Guardar como YYYY-MM-DD
        e.fechaCese ? e.fechaCese.toISOString().slice(0, 10) : null,
        e.tipoRastreo,
        e.estado,
        e.observaciones
      ]
    );

    return result.insertId;
  }

  async actualizar(id: number, datos: Partial<Omit<Empleado, 'id'>>): Promise<boolean> {
    const fields: string[] = [];
    const params: any[] = [];

    if (datos.codigoEmpleado !== undefined) {
      fields.push('codigo_empleado = ?');
      params.push(datos.codigoEmpleado);
    }
    if (datos.sedeId !== undefined) {
      fields.push('sede_id = ?');
      params.push(datos.sedeId);
    }
    if (datos.cargoId !== undefined) {
      fields.push('cargo_id = ?');
      params.push(datos.cargoId);
    }
    if (datos.dni !== undefined) {
      fields.push('dni = ?');
      params.push(datos.dni);
    }
    if (datos.nombres !== undefined) {
      fields.push('nombres = ?');
      params.push(datos.nombres);
    }
    if (datos.apellidos !== undefined) {
      fields.push('apellidos = ?');
      params.push(datos.apellidos);
    }
    if (datos.sexo !== undefined) {
      fields.push('sexo = ?');
      params.push(datos.sexo);
    }
    if (datos.telefono !== undefined) {
      fields.push('telefono = ?');
      params.push(datos.telefono);
    }
    if (datos.email !== undefined) {
      fields.push('email = ?');
      params.push(datos.email);
    }
    if (datos.foto !== undefined) {
      fields.push('foto = ?');
      params.push(datos.foto);
    }
    if (datos.fechaIngreso !== undefined) {
      fields.push('fecha_ingreso = ?');
      params.push(datos.fechaIngreso.toISOString().slice(0, 10));
    }
    if (datos.fechaCese !== undefined) {
      fields.push('fecha_cese = ?');
      params.push(datos.fechaCese ? datos.fechaCese.toISOString().slice(0, 10) : null);
    }
    if (datos.tipoRastreo !== undefined) {
      fields.push('tipo_rastreo = ?');
      params.push(datos.tipoRastreo);
    }
    if (datos.estado !== undefined) {
      fields.push('estado = ?');
      params.push(datos.estado);
    }
    if (datos.observaciones !== undefined) {
      fields.push('observaciones = ?');
      params.push(datos.observaciones);
    }

    if (fields.length === 0) return false;

    params.push(id);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE personal_empleados SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    return result.affectedRows > 0;
  }

  async listarPorSede(sedeId: number): Promise<(Empleado & { cargoNombre: string })[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.codigo_empleado, e.sede_id, e.cargo_id, e.dni, e.nombres, e.apellidos, e.sexo, e.telefono, e.email, e.foto, e.fecha_ingreso, e.fecha_cese, e.tipo_rastreo, e.estado, e.observaciones, e.created_at, e.updated_at,
              c.nombre AS cargo_nombre
       FROM personal_empleados e
       INNER JOIN personal_cargos c ON e.cargo_id = c.id
       WHERE e.sede_id = ?
       ORDER BY e.apellidos ASC, e.nombres ASC`,
      [sedeId]
    );

    return rows.map(row => {
      const entity = this.mapRowToEntity(row);
      return {
        ...entity,
        cargoNombre: row.cargo_nombre
      };
    });
  }

  async eliminar(id: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM personal_empleados WHERE id = ?`,
      [id]
    );

    return result.affectedRows > 0;
  }
}
