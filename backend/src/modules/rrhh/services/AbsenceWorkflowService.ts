import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { businessDate, businessDateTime } from '../../../core/utils/time';
import { createEmployeeNotification } from '../../rrhh-mobile/mobileNotification.service';
import { PermissionEvidenceStorageService } from './PermissionEvidenceStorageService';

const PERMISSION_TYPES = new Set(['MEDICO', 'PERSONAL', 'FAMILIAR', 'OTRO']);

function requiredText(value: unknown, label: string, maxLength = 500) {
  const text = String(value || '').trim();
  if (text.length < 3 || text.length > maxLength) throw new Error(`${label} debe tener entre 3 y ${maxLength} caracteres.`);
  return text;
}

function requiredCancellationReason(value: unknown) {
  const reason = String(value || '').trim();
  if (reason.length < 5 || reason.length > 500) {
    throw new Error('El motivo de cancelación debe tener entre 5 y 500 caracteres.');
  }
  return reason;
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

export function canCancelPermission(status: string, startsInFuture: boolean) {
  return status === 'PENDIENTE' || (status === 'APROBADO' && startsInFuture);
}

export function canCancelVacation(status: string, startsInFuture: boolean) {
  return status === 'SOLICITADA' || (['APROBADA', 'PROGRAMADA'].includes(status) && startsInFuture);
}

export class AbsenceWorkflowService {
  private readonly evidenceStorage = new PermissionEvidenceStorageService();

  async list(siteId: number | null, companyId: number | null, state?: unknown) {
    const normalizedState = String(state || 'TODOS').toUpperCase();
    const permissionParams: Array<number | string | null> = [companyId, companyId, siteId, siteId];
    const vacationParams: Array<number | string | null> = [companyId, companyId, siteId, siteId];
    const justificationParams: Array<number | string | null> = [companyId, companyId, siteId, siteId];
    const permissionStateSql = normalizedState === 'TODOS' ? '' : 'AND request.estado = ?';
    const vacationStateSql = normalizedState === 'TODOS' ? '' : 'AND vacation.estado = ?';
    if (normalizedState !== 'TODOS') { permissionParams.push(normalizedState); vacationParams.push(normalizedState); }

    const justificationStateSql = ['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA'].includes(normalizedState)
      ? 'AND justification.estado = ?'
      : '';
    if (justificationStateSql) justificationParams.push(normalizedState);

    const [permissionRows, vacationRows, justificationRows] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT request.id, request.empleado_id, request.tipo_permiso, request.fecha_inicio,
                request.fecha_fin, request.motivo, request.estado, request.aprobado_por,
                request.comentario_resolucion, request.resuelto_en, request.cancelado_por,
                request.motivo_cancelacion, request.cancelado_en, request.created_at,
                request.origen_solicitud,
                CASE WHEN attachment.id IS NULL THEN 0 ELSE 1 END AS tiene_sustento,
                attachment.nombre_original AS sustento_nombre,
                CASE WHEN request.estado = 'PENDIENTE'
                       OR (request.estado = 'APROBADO' AND request.fecha_inicio > NOW())
                     THEN 1 ELSE 0 END AS puede_cancelar,
                employee.codigo_empleado, employee.nombres, employee.apellidos,
                employee.sede_id, site.nombre AS sede_nombre, role.nombre AS cargo_nombre
           FROM personal_solicitudes_permisos request
           INNER JOIN personal_empleados employee ON employee.id = request.empleado_id
           INNER JOIN personal_cargos role ON role.id = employee.cargo_id
           INNER JOIN sedes site ON site.id = employee.sede_id
           LEFT JOIN personal_solicitud_permiso_adjuntos attachment ON attachment.solicitud_id = request.id
          WHERE (? IS NULL OR site.empresa_id = ?)
            AND (? IS NULL OR employee.sede_id = ?) ${permissionStateSql}
          ORDER BY (request.estado = 'PENDIENTE') DESC, request.created_at DESC`,
        permissionParams,
      ),
      pool.query<RowDataPacket[]>(
        `SELECT vacation.id, vacation.empleado_id, vacation.periodo_anio, vacation.fecha_inicio,
                vacation.fecha_fin, vacation.dias_tomados, vacation.motivo, vacation.estado,
                vacation.revisado_por, vacation.comentario_revision, vacation.revisado_en,
                vacation.cancelado_por, vacation.motivo_cancelacion, vacation.cancelado_en,
                CASE WHEN vacation.estado = 'SOLICITADA'
                       OR (vacation.estado IN ('APROBADA','PROGRAMADA') AND vacation.fecha_inicio > CURDATE())
                     THEN 1 ELSE 0 END AS puede_cancelar,
                vacation.created_at, employee.codigo_empleado, employee.nombres,
                employee.apellidos, employee.sede_id, site.nombre AS sede_nombre,
                role.nombre AS cargo_nombre
           FROM personal_vacaciones vacation
           INNER JOIN personal_empleados employee ON employee.id = vacation.empleado_id
           INNER JOIN personal_cargos role ON role.id = employee.cargo_id
           INNER JOIN sedes site ON site.id = employee.sede_id
          WHERE (? IS NULL OR site.empresa_id = ?)
            AND (? IS NULL OR employee.sede_id = ?) ${vacationStateSql}
          ORDER BY (vacation.estado = 'SOLICITADA') DESC, vacation.created_at DESC`,
        vacationParams,
      ),
      pool.query<RowDataPacket[]>(
        `SELECT justification.id, justification.asistencia_id, justification.empleado_id,
                justification.tipo_incidencia, justification.categoria, justification.motivo,
                justification.estado, justification.origen_solicitud AS origen, justification.revisado_por,
                justification.comentario_revision, justification.revisado_en,
                justification.cancelado_en, justification.created_at,
                DATE_FORMAT(attendance.fecha, '%Y-%m-%d') AS fecha_incidencia,
                attendance.estado_asistencia, attendance.minutos_tardanza,
                CASE WHEN attachment.id IS NULL THEN 0 ELSE 1 END AS tiene_sustento,
                attachment.nombre_original AS sustento_nombre,
                employee.codigo_empleado, employee.nombres, employee.apellidos,
                employee.sexo, employee.foto, employee.sede_id,
                site.nombre AS sede_nombre, role.nombre AS cargo_nombre
           FROM personal_justificaciones_asistencia justification
           INNER JOIN personal_asistencias attendance ON attendance.id = justification.asistencia_id
           INNER JOIN personal_empleados employee ON employee.id = justification.empleado_id
           INNER JOIN personal_cargos role ON role.id = employee.cargo_id
           INNER JOIN sedes site ON site.id = employee.sede_id
           LEFT JOIN personal_justificacion_asistencia_adjuntos attachment
             ON attachment.justificacion_id = justification.id
          WHERE (? IS NULL OR site.empresa_id = ?)
            AND (? IS NULL OR employee.sede_id = ?) ${justificationStateSql}
          ORDER BY (justification.estado = 'PENDIENTE') DESC, justification.created_at DESC`,
        justificationParams,
      ),
    ]);
    return {
      permissions: permissionRows[0],
      vacations: vacationRows[0],
      justifications: justificationRows[0],
    };
  }

  async getPermissionEvidence(siteId: number, requestId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT attachment.storage_key, attachment.nombre_original, attachment.mime_type,
              attachment.bytes
         FROM personal_solicitud_permiso_adjuntos attachment
         INNER JOIN personal_solicitudes_permisos request ON request.id = attachment.solicitud_id
         INNER JOIN personal_empleados employee ON employee.id = request.empleado_id
        WHERE request.id = ? AND employee.sede_id = ? LIMIT 1`,
      [requestId, siteId],
    );
    if (!rows.length) throw new Error('La solicitud no tiene un sustento disponible.');
    return {
      buffer: await this.evidenceStorage.read(String(rows[0].storage_key)),
      name: String(rows[0].nombre_original),
      mimeType: String(rows[0].mime_type),
      bytes: Number(rows[0].bytes),
    };
  }

  async getAttendanceJustificationEvidence(siteId: number, justificationId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT attachment.storage_key, attachment.nombre_original, attachment.mime_type,
              attachment.bytes
         FROM personal_justificacion_asistencia_adjuntos attachment
         INNER JOIN personal_justificaciones_asistencia justification
           ON justification.id = attachment.justificacion_id
         INNER JOIN personal_empleados employee ON employee.id = justification.empleado_id
        WHERE justification.id = ? AND employee.sede_id = ? LIMIT 1`,
      [justificationId, siteId],
    );
    if (!rows.length) throw new Error('La justificación no tiene un sustento disponible.');
    return {
      buffer: await this.evidenceStorage.read(String(rows[0].storage_key)),
      name: String(rows[0].nombre_original),
      mimeType: String(rows[0].mime_type),
      bytes: Number(rows[0].bytes),
    };
  }

  async resolveAttendanceJustification(
    siteId: number,
    actorUserId: number,
    justificationId: number,
    input: Record<string, unknown>,
  ) {
    const decision = String(input.decision || '').toUpperCase();
    if (!['APROBADA', 'RECHAZADA'].includes(decision)) {
      throw new Error('La decisión debe ser APROBADA o RECHAZADA.');
    }
    const comment = String(input.comment || '').trim();
    if (comment.length < 5) {
      throw new Error('La resolución administrativa debe tener al menos 5 caracteres.');
    }
    if (comment.length > 500) throw new Error('El comentario no puede superar 500 caracteres.');

    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT justification.id, justification.empleado_id, justification.estado,
                justification.tipo_incidencia
           FROM personal_justificaciones_asistencia justification
           INNER JOIN personal_empleados employee ON employee.id = justification.empleado_id
          WHERE justification.id = ? AND employee.sede_id = ? LIMIT 1 FOR UPDATE`,
        [justificationId, siteId],
      );
      if (!rows.length) throw new Error('Justificación de asistencia no encontrada.');
      if (rows[0].estado !== 'PENDIENTE') throw new Error('La justificación ya fue revisada.');

      await connection.query(
        `UPDATE personal_justificaciones_asistencia
            SET estado = ?, revisado_por = ?, comentario_revision = ?, revisado_en = NOW()
          WHERE id = ?`,
        [decision, actorUserId, comment || null, justificationId],
      );
      await this.audit(
        connection,
        'RESOLUCION_JUSTIFICACION_ASISTENCIA',
        Number(rows[0].empleado_id),
        actorUserId,
        decision,
        { justification_id: justificationId, incident_type: rows[0].tipo_incidencia, comment: comment || null },
      );
      await createEmployeeNotification(connection, {
        employeeId: Number(rows[0].empleado_id),
        type: 'JUSTIFICACION_RESUELTA',
        title: decision === 'APROBADA' ? 'Justificación aprobada' : 'Justificación no aprobada',
        message: decision === 'APROBADA'
          ? 'RR. HH. aprobó tu justificación. La marcación original se conserva como parte del historial.'
          : 'RR. HH. revisó tu justificación y no fue aprobada. Consulta el comentario de la revisión.',
        priority: decision === 'APROBADA' ? 'INFO' : 'IMPORTANTE',
        action: 'HISTORIAL',
        referenceType: 'JUSTIFICACION',
        referenceId: justificationId,
        deduplicationKey: `JUSTIFICACION:${justificationId}:${decision}`,
      });
    });
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
          AND estado NOT IN ('RECHAZADO','CANCELADO') AND fecha_inicio < ? AND fecha_fin > ? LIMIT 1`,
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
      await createEmployeeNotification(connection, {
        employeeId: Number(rows[0].empleado_id),
        type: 'PERMISO_RESUELTO',
        title: decision === 'APROBADO' ? 'Permiso aprobado' : 'Permiso no aprobado',
        message: decision === 'APROBADO'
          ? 'RR. HH. aprobó tu solicitud de permiso. Revisa el detalle en tu historial.'
          : 'RR. HH. revisó tu solicitud de permiso y no fue aprobada.',
        priority: decision === 'APROBADO' ? 'INFO' : 'IMPORTANTE',
        action: 'HISTORIAL',
        referenceType: 'PERMISO',
        referenceId: requestId,
        deduplicationKey: `PERMISO:${requestId}:${decision}`,
      });
    });
  }

  async cancelPermission(siteId: number, actorUserId: number, requestId: number, input: Record<string, unknown>) {
    const reason = requiredCancellationReason(input.reason);
    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT request.id, request.empleado_id, request.estado,
                (request.fecha_inicio > NOW()) AS inicia_en_el_futuro
           FROM personal_solicitudes_permisos request
           INNER JOIN personal_empleados employee ON employee.id = request.empleado_id
          WHERE request.id = ? AND employee.sede_id = ? LIMIT 1 FOR UPDATE`,
        [requestId, siteId],
      );
      if (!rows.length) throw new Error('Solicitud de permiso no encontrada.');
      const cancellable = canCancelPermission(rows[0].estado, Number(rows[0].inicia_en_el_futuro) === 1);
      if (!cancellable) throw new Error('Esta solicitud ya inició o su estado no permite cancelarla.');
      await connection.query(
        `UPDATE personal_solicitudes_permisos
            SET estado = 'CANCELADO', cancelado_por = ?, motivo_cancelacion = ?, cancelado_en = NOW()
          WHERE id = ?`,
        [actorUserId, reason, requestId],
      );
      await this.audit(connection, 'CANCELACION_PERMISO', Number(rows[0].empleado_id), actorUserId, 'CANCELADO', {
        request_id: requestId, reason, previous_status: rows[0].estado,
      });
      await createEmployeeNotification(connection, {
        employeeId: Number(rows[0].empleado_id), type: 'PERMISO_CANCELADO',
        title: 'Permiso cancelado', message: 'RR. HH. canceló un permiso programado. Revisa el detalle registrado.',
        priority: 'IMPORTANTE', action: 'HISTORIAL', referenceType: 'PERMISO', referenceId: requestId,
        deduplicationKey: `PERMISO:${requestId}:CANCELADO`,
      });
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
      await createEmployeeNotification(connection, {
        employeeId: Number(rows[0].empleado_id), type: 'VACACIONES_RESUELTAS',
        title: decision === 'APROBADA' ? 'Vacaciones aprobadas' : 'Vacaciones no aprobadas',
        message: decision === 'APROBADA'
          ? 'RR. HH. aprobó tus vacaciones. Consulta las fechas en tu historial.'
          : 'RR. HH. revisó tu solicitud de vacaciones y no fue aprobada.',
        priority: decision === 'APROBADA' ? 'INFO' : 'IMPORTANTE', action: 'HISTORIAL',
        referenceType: 'VACACIONES', referenceId: vacationId,
        deduplicationKey: `VACACIONES:${vacationId}:${decision}`,
      });
    });
  }

  async cancelVacation(siteId: number, actorUserId: number, vacationId: number, input: Record<string, unknown>) {
    const reason = requiredCancellationReason(input.reason);
    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT vacation.id, vacation.empleado_id, vacation.estado,
                (vacation.fecha_inicio > CURDATE()) AS inicia_en_el_futuro
           FROM personal_vacaciones vacation
           INNER JOIN personal_empleados employee ON employee.id = vacation.empleado_id
          WHERE vacation.id = ? AND employee.sede_id = ? LIMIT 1 FOR UPDATE`,
        [vacationId, siteId],
      );
      if (!rows.length) throw new Error('Solicitud de vacaciones no encontrada.');
      const cancellable = canCancelVacation(rows[0].estado, Number(rows[0].inicia_en_el_futuro) === 1);
      if (!cancellable) throw new Error('Estas vacaciones ya iniciaron o su estado no permite cancelarlas.');
      await connection.query(
        `UPDATE personal_vacaciones
            SET estado = 'CANCELADA', cancelado_por = ?, motivo_cancelacion = ?, cancelado_en = NOW()
          WHERE id = ?`,
        [actorUserId, reason, vacationId],
      );
      await this.audit(connection, 'CANCELACION_VACACIONES', Number(rows[0].empleado_id), actorUserId, 'CANCELADA', {
        vacation_id: vacationId, reason, previous_status: rows[0].estado,
      });
      await createEmployeeNotification(connection, {
        employeeId: Number(rows[0].empleado_id), type: 'VACACIONES_CANCELADAS',
        title: 'Vacaciones canceladas', message: 'RR. HH. canceló un periodo de vacaciones programado.',
        priority: 'IMPORTANTE', action: 'HISTORIAL', referenceType: 'VACACIONES', referenceId: vacationId,
        deduplicationKey: `VACACIONES:${vacationId}:CANCELADA`,
      });
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
