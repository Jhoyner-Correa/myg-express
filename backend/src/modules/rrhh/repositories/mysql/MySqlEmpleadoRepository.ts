// ============================================================
// backend/src/modules/rrhh/repositories/mysql/MySqlEmpleadoRepository.ts
// Implementación del repositorio de empleados para MySQL/MariaDB
// ============================================================

import { pool, runInTransaction } from '../../../../core/database/database';
import { Empleado, EmployeeGender, EmployeeTracking, EmployeeStatus } from '../../domain/Empleado';
import { employeeCodePrefix, formatEmployeeCode } from '../../domain/employeeCode';
import { IEmpleadoRepository } from '../IEmpleadoRepository';
import { businessDate } from '../../../../core/utils/time';
import { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export class MySqlEmpleadoRepository implements IEmpleadoRepository {
  private dateOnly(value: string | Date): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  private async assertSameCompanyTransfer(
    connection: PoolConnection,
    currentSiteId: number,
    nextSiteId: number,
  ): Promise<void> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT current_site.empresa_id AS current_company_id,
              next_site.empresa_id AS next_company_id
         FROM sedes current_site
         INNER JOIN sedes next_site ON next_site.id = ?
        WHERE current_site.id = ?
        LIMIT 1`,
      [nextSiteId, currentSiteId],
    );
    if (!rows.length) throw new Error('La sede seleccionada no existe.');
    if (Number(rows[0].current_company_id) !== Number(rows[0].next_company_id)) {
      throw new Error('Un traslado no puede cambiar al colaborador de empresa.');
    }
  }

  private async synchronizeSiteHistory(
    connection: PoolConnection,
    employeeId: number,
    siteId: number,
    status: EmployeeStatus,
    effectiveDate: string,
  ): Promise<void> {
    const [openRows] = await connection.query<RowDataPacket[]>(
      `SELECT id, sede_id, vigente_desde
         FROM personal_empleado_sedes
        WHERE empleado_id = ? AND vigente_hasta IS NULL
        LIMIT 1
        FOR UPDATE`,
      [employeeId],
    );
    const open = openRows[0];

    if (status !== 'ACTIVO') {
      if (open) {
        await connection.query(
          `UPDATE personal_empleado_sedes
              SET vigente_hasta = GREATEST(vigente_desde, ?),
                  motivo = 'CIERRE_POR_ESTADO_LABORAL'
            WHERE id = ?`,
          [effectiveDate, open.id],
        );
      }
      return;
    }

    if (!open) {
      await connection.query(
        `INSERT INTO personal_empleado_sedes (
          empleado_id, sede_id, vigente_desde, vigente_hasta, motivo
        ) VALUES (?, ?, ?, NULL, 'ACTIVACION_LABORAL')`,
        [employeeId, siteId, effectiveDate],
      );
      return;
    }

    if (Number(open.sede_id) === siteId) return;

    const openFrom = this.dateOnly(open.vigente_desde as string | Date);
    if (openFrom === effectiveDate) {
      await connection.query(
        `UPDATE personal_empleado_sedes
            SET sede_id = ?, motivo = 'TRASLADO_EN_MISMA_FECHA'
          WHERE id = ?`,
        [siteId, open.id],
      );
      return;
    }

    await connection.query(
      `UPDATE personal_empleado_sedes
          SET vigente_hasta = DATE_SUB(?, INTERVAL 1 DAY),
              motivo = 'TRASLADO_DE_SEDE'
        WHERE id = ?`,
      [effectiveDate, open.id],
    );
    await connection.query(
      `INSERT INTO personal_empleado_sedes (
        empleado_id, sede_id, vigente_desde, vigente_hasta, motivo
      ) VALUES (?, ?, ?, NULL, 'TRASLADO_DE_SEDE')`,
      [employeeId, siteId, effectiveDate],
    );
  }
  
  private mapRowToEntity(row: any): Empleado {
    return {
      id: row.id,
      codigoEmpleado: row.codigo_empleado,
      sedeId: row.sede_id,
      cargoId: row.cargo_id,
      dni: row.dni,
      ruc: row.ruc || null,
      nombres: row.nombres,
      apellidos: row.apellidos,
      sexo: row.sexo as EmployeeGender,
      telefono: row.telefono || null,
      email: row.email || null,
      direccion: row.direccion || '',
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
      `SELECT id, codigo_empleado, sede_id, cargo_id, dni, ruc, nombres, apellidos, sexo, telefono, email, direccion, foto, fecha_ingreso, fecha_cese, tipo_rastreo, estado, observaciones, created_at, updated_at
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
      `SELECT id, codigo_empleado, sede_id, cargo_id, dni, ruc, nombres, apellidos, sexo, telefono, email, direccion, foto, fecha_ingreso, fecha_cese, tipo_rastreo, estado, observaciones, created_at, updated_at
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
      `SELECT id, codigo_empleado, sede_id, cargo_id, dni, ruc, nombres, apellidos, sexo, telefono, email, direccion, foto, fecha_ingreso, fecha_cese, tipo_rastreo, estado, observaciones, created_at, updated_at
       FROM personal_empleados
       WHERE dni = ?
       LIMIT 1`,
      [dni]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async buscarPorRuc(ruc: string): Promise<Empleado | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, codigo_empleado, sede_id, cargo_id, dni, ruc, nombres, apellidos, sexo, telefono, email, direccion, foto, fecha_ingreso, fecha_cese, tipo_rastreo, estado, observaciones, created_at, updated_at
       FROM personal_empleados
       WHERE ruc = ?
       LIMIT 1`,
      [ruc]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async crearConCodigoAutomatico(e: Omit<Empleado, 'id' | 'codigoEmpleado'>): Promise<number> {
    return runInTransaction(async connection => {
      const [companies] = await connection.query<RowDataPacket[]>(
        `SELECT company.id, company.codigo
           FROM sedes site
           INNER JOIN empresas company ON company.id = site.empresa_id
          WHERE site.id = ?
          LIMIT 1`,
        [e.sedeId],
      );
      if (!companies.length) throw new Error('La sede no pertenece a una empresa valida.');

      const companyId = Number(companies[0].id);
      const prefix = employeeCodePrefix(String(companies[0].codigo), companyId);
      await connection.query(
        `INSERT INTO personal_codigo_empleado_secuencias (empresa_id, prefijo, ultimo_valor)
         VALUES (?, ?, 0)
         ON DUPLICATE KEY UPDATE prefijo = prefijo`,
        [companyId, prefix],
      );

      const [sequences] = await connection.query<RowDataPacket[]>(
        `SELECT prefijo, ultimo_valor
           FROM personal_codigo_empleado_secuencias
          WHERE empresa_id = ?
          FOR UPDATE`,
        [companyId],
      );
      if (!sequences.length) throw new Error('No se pudo reservar el codigo del colaborador.');

      const nextValue = Number(sequences[0].ultimo_valor) + 1;
      const employeeCode = formatEmployeeCode(String(sequences[0].prefijo), nextValue);
      await connection.query(
        'UPDATE personal_codigo_empleado_secuencias SET ultimo_valor = ? WHERE empresa_id = ?',
        [nextValue, companyId],
      );

      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_empleados (
          codigo_empleado, sede_id, cargo_id, dni, ruc, nombres, apellidos,
          sexo, telefono, email, direccion, foto, fecha_ingreso, fecha_cese,
          tipo_rastreo, estado, observaciones
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          employeeCode, e.sedeId, e.cargoId, e.dni, e.ruc, e.nombres, e.apellidos,
          e.sexo, e.telefono, e.email, e.direccion, e.foto,
          e.fechaIngreso.toISOString().slice(0, 10),
          e.fechaCese ? e.fechaCese.toISOString().slice(0, 10) : null,
          e.tipoRastreo, e.estado, e.observaciones,
        ],
      );
      await connection.query(
        `INSERT INTO personal_empleado_sedes (
          empleado_id, sede_id, vigente_desde, vigente_hasta, motivo
        ) VALUES (?, ?, ?, ?, 'ALTA_DE_COLABORADOR')`,
        [
          result.insertId,
          e.sedeId,
          e.fechaIngreso.toISOString().slice(0, 10),
          e.estado === 'ACTIVO'
            ? null
            : (e.fechaCese ?? e.fechaIngreso).toISOString().slice(0, 10),
        ],
      );
      return result.insertId;
    });
  }

  async actualizar(id: number, datos: Partial<Omit<Empleado, 'id' | 'codigoEmpleado'>>): Promise<boolean> {
    const fields: string[] = [];
    const params: any[] = [];

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
    if (datos.ruc !== undefined) {
      fields.push('ruc = ?');
      params.push(datos.ruc);
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
    if (datos.direccion !== undefined) {
      fields.push('direccion = ?');
      params.push(datos.direccion);
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

    return runInTransaction(async connection => {
      const [currentRows] = await connection.query<RowDataPacket[]>(
        `SELECT sede_id, estado
           FROM personal_empleados
          WHERE id = ?
          LIMIT 1
          FOR UPDATE`,
        [id],
      );
      if (!currentRows.length) return false;

      const currentSiteId = Number(currentRows[0].sede_id);
      const nextSiteId = datos.sedeId ?? currentSiteId;
      const nextStatus = (datos.estado ?? String(currentRows[0].estado)) as EmployeeStatus;
      if (nextSiteId !== currentSiteId) {
        await this.assertSameCompanyTransfer(connection, currentSiteId, nextSiteId);
      }

      const updateParams = [...params, id];
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE personal_empleados SET ${fields.join(', ')} WHERE id = ?`,
        updateParams,
      );
      if (!result.affectedRows) return false;

      if (nextSiteId !== currentSiteId || datos.estado !== undefined) {
        await this.synchronizeSiteHistory(
          connection,
          id,
          nextSiteId,
          nextStatus,
          businessDate(),
        );
      }
      return true;
    });
  }

  async listarPorSede(sedeId: number): Promise<(Empleado & { cargoNombre: string })[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.codigo_empleado, e.sede_id, e.cargo_id, e.dni, e.ruc, e.nombres, e.apellidos, e.sexo, e.telefono, e.email, e.direccion, e.foto, e.fecha_ingreso, e.fecha_cese, e.tipo_rastreo, e.estado, e.observaciones, e.created_at, e.updated_at,
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

  async listarDirectorio(
    sedeId: number | null,
    companyId: number | null,
  ): Promise<(Empleado & { cargoNombre: string; sedeNombre: string; accesoMovilActivo: boolean })[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT e.id, e.codigo_empleado, e.sede_id, e.cargo_id, e.dni, e.ruc, e.nombres,
              e.apellidos, e.sexo, e.telefono, e.email, e.direccion, e.foto, e.fecha_ingreso,
              e.fecha_cese, e.tipo_rastreo, e.estado, e.observaciones,
              e.created_at, e.updated_at, c.nombre AS cargo_nombre,
              s.nombre AS sede_nombre,
              EXISTS(
                SELECT 1
                  FROM personal_dispositivos device
                 WHERE device.empleado_id = e.id
                   AND device.estado = 'AUTORIZADO'
              ) AS acceso_movil_activo
         FROM personal_empleados e
         INNER JOIN personal_cargos c ON e.cargo_id = c.id
         INNER JOIN sedes s ON s.id = e.sede_id
        WHERE (? IS NULL OR s.empresa_id = ?)
          AND (? IS NULL OR e.sede_id = ?)
        ORDER BY s.nombre ASC, e.apellidos ASC, e.nombres ASC`,
      [companyId, companyId, sedeId, sedeId],
    );

    return rows.map(row => ({
      ...this.mapRowToEntity(row),
      cargoNombre: String(row.cargo_nombre),
      sedeNombre: String(row.sede_nombre),
      accesoMovilActivo: Boolean(row.acceso_movil_activo),
    }));
  }

  async eliminar(id: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM personal_empleados WHERE id = ?`,
      [id]
    );

    return result.affectedRows > 0;
  }
}
