import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';

const TRACKING_TYPES = ['NINGUNO', 'SOLO_MARCACION', 'CONTINUO'] as const;

type TrackingType = (typeof TRACKING_TYPES)[number];

export interface JobRoleInput {
  name: string;
  description?: string | null;
  defaultTrackingType?: TrackingType;
}

export interface ScheduleInput {
  name: string;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
}

export interface ScheduleAssignmentInput {
  weekday: number;
  scheduleId: number;
}

function requiredName(value: unknown, label: string): string {
  const name = String(value || '').trim();
  if (name.length < 2 || name.length > 100) {
    throw new Error(`${label} debe tener entre 2 y 100 caracteres.`);
  }
  return name;
}

function clock(value: unknown, label: string): string {
  const raw = String(value || '').trim();
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`${label} debe usar el formato HH:mm.`);
  }
  return `${match[1]}:${match[2]}:00`;
}

export class RrhhCatalogService {
  async listSites(scopedSiteId: number | null) {
    const params: number[] = [];
    const where = scopedSiteId === null
      ? 'WHERE estado = \'activo\''
      : 'WHERE id = ? AND estado = \'activo\'';
    if (scopedSiteId !== null) params.push(scopedSiteId);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, nombre, estado FROM sedes ${where} ORDER BY nombre ASC`,
      params,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.nombre),
      code: null,
      status: String(row.estado),
    }));
  }

  async listJobRoles() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, nombre, descripcion, tipo_rastreo_defecto, created_at, updated_at
         FROM personal_cargos ORDER BY nombre ASC`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.nombre),
      description: row.descripcion ? String(row.descripcion) : null,
      default_tracking_type: String(row.tipo_rastreo_defecto),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async saveJobRole(id: number | null, input: JobRoleInput, actorUserId: number) {
    const name = requiredName(input.name, 'El nombre del cargo');
    const description = String(input.description || '').trim().slice(0, 255) || null;
    const trackingType = input.defaultTrackingType || 'SOLO_MARCACION';
    if (!TRACKING_TYPES.includes(trackingType)) {
      throw new Error('El tipo de rastreo del cargo no es válido.');
    }
    const resultId = await runInTransaction(async (connection) => {
      let roleId = id;
      if (roleId === null) {
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_cargos (nombre, descripcion, tipo_rastreo_defecto)
           VALUES (?, ?, ?)`,
          [name, description, trackingType],
        );
        roleId = result.insertId;
      } else {
        const [result] = await connection.query<ResultSetHeader>(
          `UPDATE personal_cargos
              SET nombre = ?, descripcion = ?, tipo_rastreo_defecto = ?
            WHERE id = ?`,
          [name, description, trackingType, roleId],
        );
        if (!result.affectedRows) throw new Error('Cargo no encontrado.');
      }
      await connection.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, usuario_id, exitoso, codigo_resultado, metadata_json
        ) VALUES ('CONFIGURACION_CARGO', ?, 1, ?, ?)`,
        [actorUserId, id === null ? 'CREADO' : 'ACTUALIZADO', JSON.stringify({ role_id: roleId })],
      );
      return roleId;
    });
    return (await this.listJobRoles()).find((role) => role.id === resultId);
  }

  async listSchedules() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, nombre, hora_entrada, hora_salida, tolerancia_minutos,
              created_at, updated_at
         FROM personal_horarios ORDER BY nombre ASC`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.nombre),
      start_time: String(row.hora_entrada),
      end_time: String(row.hora_salida),
      tolerance_minutes: Number(row.tolerancia_minutos),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async saveSchedule(id: number | null, input: ScheduleInput, actorUserId: number) {
    const name = requiredName(input.name, 'El nombre del horario');
    const startTime = clock(input.startTime, 'La hora de entrada');
    const endTime = clock(input.endTime, 'La hora de salida');
    const tolerance = Number(input.toleranceMinutes);
    if (!Number.isInteger(tolerance) || tolerance < 0 || tolerance > 180) {
      throw new Error('La tolerancia debe estar entre 0 y 180 minutos.');
    }
    if (startTime === endTime) throw new Error('La entrada y salida no pueden ser iguales.');

    const resultId = await runInTransaction(async (connection) => {
      let scheduleId = id;
      if (scheduleId === null) {
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_horarios (nombre, hora_entrada, hora_salida, tolerancia_minutos)
           VALUES (?, ?, ?, ?)`,
          [name, startTime, endTime, tolerance],
        );
        scheduleId = result.insertId;
      } else {
        const [result] = await connection.query<ResultSetHeader>(
          `UPDATE personal_horarios
              SET nombre = ?, hora_entrada = ?, hora_salida = ?, tolerancia_minutos = ?
            WHERE id = ?`,
          [name, startTime, endTime, tolerance, scheduleId],
        );
        if (!result.affectedRows) throw new Error('Horario no encontrado.');
      }
      await connection.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, usuario_id, exitoso, codigo_resultado, metadata_json
        ) VALUES ('CONFIGURACION_HORARIO', ?, 1, ?, ?)`,
        [actorUserId, id === null ? 'CREADO' : 'ACTUALIZADO', JSON.stringify({ schedule_id: scheduleId })],
      );
      return scheduleId;
    });
    return (await this.listSchedules()).find((schedule) => schedule.id === resultId);
  }

  async getEmployeeSchedule(employeeId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT assignment.dia_semana, assignment.horario_id,
              schedule.nombre, schedule.hora_entrada, schedule.hora_salida
         FROM personal_empleado_horarios assignment
         INNER JOIN personal_horarios schedule ON schedule.id = assignment.horario_id
        WHERE assignment.empleado_id = ? ORDER BY assignment.dia_semana ASC`,
      [employeeId],
    );
    return rows.map((row) => ({
      weekday: Number(row.dia_semana),
      schedule_id: Number(row.horario_id),
      schedule_name: String(row.nombre),
      start_time: String(row.hora_entrada),
      end_time: String(row.hora_salida),
    }));
  }

  async replaceEmployeeSchedule(
    employeeId: number,
    assignments: ScheduleAssignmentInput[],
    actorUserId: number,
  ) {
    if (!Array.isArray(assignments) || assignments.length > 7) {
      throw new Error('La asignación semanal no es válida.');
    }
    const normalized = assignments.map((assignment) => ({
      weekday: Number(assignment.weekday),
      scheduleId: Number(assignment.scheduleId),
    }));
    if (normalized.some((value) =>
      !Number.isInteger(value.weekday) || value.weekday < 1 || value.weekday > 7
      || !Number.isInteger(value.scheduleId) || value.scheduleId < 1
    )) {
      throw new Error('Cada día y horario asignado debe ser válido.');
    }
    if (new Set(normalized.map((value) => value.weekday)).size !== normalized.length) {
      throw new Error('No puedes asignar dos horarios al mismo día.');
    }

    await runInTransaction(async (connection) => {
      const [employeeRows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM personal_empleados WHERE id = ? LIMIT 1 FOR UPDATE',
        [employeeId],
      );
      if (!employeeRows.length) throw new Error('Empleado no encontrado.');
      if (normalized.length) {
        const [scheduleRows] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM personal_horarios WHERE id IN (${normalized.map(() => '?').join(', ')})`,
          normalized.map((value) => value.scheduleId),
        );
        if (new Set(scheduleRows.map((row) => Number(row.id))).size
            !== new Set(normalized.map((value) => value.scheduleId)).size) {
          throw new Error('Uno de los horarios seleccionados ya no existe.');
        }
      }
      await connection.query('DELETE FROM personal_empleado_horarios WHERE empleado_id = ?', [employeeId]);
      for (const assignment of normalized) {
        await connection.query(
          `INSERT INTO personal_empleado_horarios (empleado_id, horario_id, dia_semana)
           VALUES (?, ?, ?)`,
          [employeeId, assignment.scheduleId, assignment.weekday],
        );
      }
      await connection.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json
        ) VALUES ('ASIGNACION_HORARIO', ?, ?, 1, 'ACTUALIZADA', ?)`,
        [employeeId, actorUserId, JSON.stringify({ assignments: normalized })],
      );
    });
    return this.getEmployeeSchedule(employeeId);
  }
}
