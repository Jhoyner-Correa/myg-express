import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { businessDate, businessDateTime } from '../../../core/utils/time';

const PERMISSION_TYPES = new Set(['MEDICO', 'PERSONAL', 'FAMILIAR', 'OTRO']);

function requiredText(value: unknown, label: string, maxLength = 500) {
  const text = String(value || '').trim();
  if (text.length < 3 || text.length > maxLength) throw new Error(`${label} debe tener entre 3 y ${maxLength} caracteres.`);
  return text;
}

export function validateAbsenceDate(value: unknown, label: string) {
  const date = String(value || '').trim();
  const parsed = new Date(`${date}T12:00:00-05:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || businessDate(parsed) !== date) {
    throw new Error(`${label} no es válida.`);
  }
  return date;
}

export function validateAbsenceDateTime(value: unknown, label: string) {
  const raw = String(value || '').trim();
  const parsed = new Date(`${raw}:00-05:00`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) || Number.isNaN(parsed.getTime())
      || businessDateTime(parsed).slice(0, 16).replace(' ', 'T') !== raw) {
    throw new Error(`${label} no es válida.`);
  }
  return `${raw.replace('T', ' ')}:00`;
}

export class AbsenceWorkflowService {
  async list(siteId: number, state?: unknown) {
    const normalizedState = String(state || 'TODOS').toUpperCase();
    const permissionParams: Array<number | string> = [siteId];
    const vacationParams: Array<number | string> = [siteId];
    const permissionStateSql = normalizedState === 'TODOS' ? '' : 'AND request.estado = ?';
    const vacationStateSql = normalizedState === 'TODOS' ? '' : 'AND vacation.estado = ?';
    if (normalizedState !== 'TODOS') { permissionParams.push(normalizedState); vacationParams.push(normalizedState); }

    const [permissionRows, vacationRows] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT request.id, request.empleado_id, request.tipo_permiso, request.fecha_inicio,
                request.fecha_fin, request.motivo, request.estado, request.aprobado_por,
                request.comentario_resolucion, request.resuelto_en, request.created_at,
                employee.codigo_empleado, employee.nombres, employee.apellidos,
                role.nombre AS cargo_nombre
           FROM personal_solicitudes_permisos request
           INNER JOIN personal_empleados employee ON employee.id = request.empleado_id
           INNER JOIN personal_cargos role ON role.id = employee.cargo_id
          WHERE employee.sede_id = ? ${permissionStateSql}
          ORDER BY (request.estado = 'PENDIENTE') DESC, request.created_at DESC`,
        permissionParams,
      ),
      pool.query<RowDataPacket[]>(
        `SELECT vacation.id, vacation.empleado_id, vacation.periodo_anio, vacation.fecha_inicio,
                vacation.fecha_fin, vacation.dias_tomados, vacation.motivo, vacation.estado,
                vacation.revisado_por, vacation.comentario_revision, vacation.revisado_en,
                vacation.created_at, employee.codigo_empleado, employee.nombres,
                employee.apellidos, role.nombre AS cargo_nombre
           FROM personal_vacaciones vacation
           INNER JOIN personal_empleados employee ON employee.id = vacation.empleado_id
           INNER JOIN personal_cargos role ON role.id = employee.cargo_id
          WHERE employee.sede_id = ? ${vacationStateSql}
          ORDER BY (vacation.estado = 'SOLICITADA') DESC, vacation.created_at DESC`,
        vacationParams,
      ),
    ]);
    return { permissions: permissionRows[0], vacations: vacationRows[0] };
  }

  async createPermission(siteId: number, actorUserId: number, input: Record<string, unknown>) {
    const employeeId = Number(input.employee_id);
    const type = String(input.type || '').toUpperCase();
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new Error('Selecciona un colaborador.');
    if (!PERMISSION_TYPES.has(type)) throw new Error('El tipo de permiso no es válido.');
    const start = validateAbsenceDateTime(input.start_at, 'La fecha de inicio');
    const end = validateAbsenceDateTime(input.end_at, 'La fecha de fin');
    if (end <= start) throw new Error('La fecha de fin debe ser posterior al inicio.');
    const reason = requiredText(input.reason, 'El motivo');
    const id = await runInTransaction(async connection => {
      const [employee] = await connection.query<RowDataPacket[]>('SELECT id FROM personal_empleados WHERE id = ? AND sede_id = ? LIMIT 1', [employeeId, siteId]);
      if (!employee.length) throw new Error('Colaborador no encontrado en la sede.');
      const [overlap] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM personal_solicitudes_permisos WHERE empleado_id = ?
          AND estado <> 'RECHAZADO' AND fecha_inicio < ? AND fecha_fin > ? LIMIT 1`,
        [employeeId, end, start],
      );
      if (overlap.length) throw new Error('El colaborador ya tiene un permiso registrado en ese horario.');
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_solicitudes_permisos
          (empleado_id, tipo_permiso, fecha_inicio, fecha_fin, motivo, estado)
         VALUES (?, ?, ?, ?, ?, 'PENDIENTE')`,
        [employeeId, type, start, end, reason],
      );
      await this.audit(connection, 'SOLICITUD_PERMISO', employeeId, actorUserId, 'CREADA', { request_id: result.insertId });
      return result.insertId;
    });
    return { id };
  }

  async resolvePermission(siteId: number, actorUserId: number, requestId: number, input: Record<string, unknown>) {
    const decision = String(input.decision || '').toUpperCase();
    if (!['APROBADO', 'RECHAZADO'].includes(decision)) throw new Error('La decisión no es válida.');
    const comment = String(input.comment || '').trim().slice(0, 500) || null;
    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT request.id, request.empleado_id, request.estado
           FROM personal_solicitudes_permisos request
           INNER JOIN personal_empleados employee ON employee.id = request.empleado_id
          WHERE request.id = ? AND employee.sede_id = ? LIMIT 1 FOR UPDATE`,
        [requestId, siteId],
      );
      if (!rows.length) throw new Error('Solicitud de permiso no encontrada.');
      if (rows[0].estado !== 'PENDIENTE') throw new Error('La solicitud ya fue resuelta.');
      await connection.query(
        `UPDATE personal_solicitudes_permisos SET estado = ?, aprobado_por = ?,
                comentario_resolucion = ?, resuelto_en = NOW() WHERE id = ?`,
        [decision, actorUserId, comment, requestId],
      );
      await this.audit(connection, 'RESOLUCION_PERMISO', Number(rows[0].empleado_id), actorUserId, decision, { request_id: requestId, comment });
    });
  }

  async createVacation(siteId: number, actorUserId: number, input: Record<string, unknown>) {
    const employeeId = Number(input.employee_id);
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new Error('Selecciona un colaborador.');
    const start = validateAbsenceDate(input.start_date, 'La fecha de inicio');
    const end = validateAbsenceDate(input.end_date, 'La fecha de fin');
    if (end < start) throw new Error('La fecha de fin debe ser igual o posterior al inicio.');
    const days = Math.floor((new Date(`${end}T12:00:00-05:00`).getTime() - new Date(`${start}T12:00:00-05:00`).getTime()) / 86_400_000) + 1;
    if (days > 60) throw new Error('Una solicitud no puede superar 60 días.');
    const reason = requiredText(input.reason, 'El motivo');
    const year = Number(start.slice(0, 4));
    const id = await runInTransaction(async connection => {
      const [employee] = await connection.query<RowDataPacket[]>('SELECT id FROM personal_empleados WHERE id = ? AND sede_id = ? LIMIT 1', [employeeId, siteId]);
      if (!employee.length) throw new Error('Colaborador no encontrado en la sede.');
      const [overlap] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM personal_vacaciones WHERE empleado_id = ?
          AND estado NOT IN ('RECHAZADA','CANCELADA') AND fecha_inicio <= ? AND fecha_fin >= ? LIMIT 1`,
        [employeeId, end, start],
      );
      if (overlap.length) throw new Error('El colaborador ya tiene vacaciones registradas en esas fechas.');
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_vacaciones
          (empleado_id, periodo_anio, fecha_inicio, fecha_fin, dias_tomados, motivo, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'SOLICITADA')`,
        [employeeId, year, start, end, days, reason],
      );
      await this.audit(connection, 'SOLICITUD_VACACIONES', employeeId, actorUserId, 'CREADA', { vacation_id: result.insertId, days });
      return result.insertId;
    });
    return { id, days };
  }

  async resolveVacation(siteId: number, actorUserId: number, vacationId: number, input: Record<string, unknown>) {
    const decision = String(input.decision || '').toUpperCase();
    if (!['APROBADA', 'RECHAZADA'].includes(decision)) throw new Error('La decisión no es válida.');
    const comment = String(input.comment || '').trim().slice(0, 500) || null;
    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT vacation.id, vacation.empleado_id, vacation.estado
           FROM personal_vacaciones vacation
           INNER JOIN personal_empleados employee ON employee.id = vacation.empleado_id
          WHERE vacation.id = ? AND employee.sede_id = ? LIMIT 1 FOR UPDATE`,
        [vacationId, siteId],
      );
      if (!rows.length) throw new Error('Solicitud de vacaciones no encontrada.');
      if (rows[0].estado !== 'SOLICITADA') throw new Error('La solicitud ya fue revisada.');
      await connection.query(
        `UPDATE personal_vacaciones SET estado = ?, revisado_por = ?,
                comentario_revision = ?, revisado_en = NOW() WHERE id = ?`,
        [decision, actorUserId, comment, vacationId],
      );
      await this.audit(connection, 'RESOLUCION_VACACIONES', Number(rows[0].empleado_id), actorUserId, decision, { vacation_id: vacationId, comment });
    });
  }

  private async audit(connection: import('mysql2/promise').PoolConnection, event: string, employeeId: number, userId: number, result: string, metadata: unknown) {
    await connection.query(
      `INSERT INTO personal_auditoria_eventos
        (tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [event, employeeId, userId, result, JSON.stringify(metadata)],
    );
  }
}
