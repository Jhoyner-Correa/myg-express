import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { assertDateOnly, businessDate } from '../../../core/utils/time';
import { createEmployeeNotification } from '../../rrhh-mobile/mobileNotification.service';
import { OvertimeEvidenceStorageService } from './OvertimeEvidenceStorageService';

const OVERTIME_DECISIONS = new Set(['APROBAR', 'RECHAZAR']);

function positiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} no válido.`);
  return parsed;
}

function auditComment(value: unknown): string {
  const comment = String(value ?? '').trim();
  if (comment.length < 8 || comment.length > 500) {
    throw new Error('El sustento debe tener entre 8 y 500 caracteres.');
  }
  return comment;
}

function attendanceDate(value: unknown): string {
  const date = assertDateOnly(value);
  const parsed = new Date(`${date}T12:00:00-05:00`);
  if (Number.isNaN(parsed.getTime()) || businessDate(parsed) !== date) throw new Error('Fecha no válida.');
  return date;
}

export type AttendanceReportMode = 'WEEK' | 'MONTH';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

export function attendanceReportRange(modeValue: unknown, anchorValue: unknown) {
  const mode = String(modeValue ?? 'MONTH').toUpperCase() as AttendanceReportMode;
  if (mode !== 'WEEK' && mode !== 'MONTH') throw new Error('Vista del historial no válida.');
  const anchor = attendanceDate(anchorValue);
  const date = utcDate(anchor);
  let start: Date;
  let end: Date;
  if (mode === 'MONTH') {
    start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
    end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12));
  } else {
    const isoWeekday = date.getUTCDay() || 7;
    start = new Date(date);
    start.setUTCDate(start.getUTCDate() - isoWeekday + 1);
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
  }
  return { mode, anchor, startDate: isoDate(start), endDate: isoDate(end) };
}

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = utcDate(start);
  const last = utcDate(end);
  while (cursor <= last) {
    dates.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function isoWeekday(value: string): number {
  return utcDate(value).getUTCDay() || 7;
}

export class AttendanceManagementService {
  private readonly overtimeEvidenceStorage = new OvertimeEvidenceStorageService();

  async detail(siteId: number, employeeIdValue: unknown, dateValue: unknown) {
    const employeeId = positiveInteger(employeeIdValue, 'Colaborador');
    const date = attendanceDate(dateValue);
    const [employees] = await pool.query<RowDataPacket[]>(
      `SELECT employee.id, employee.codigo_empleado, employee.nombres, employee.apellidos,
              employee.foto, role.nombre AS cargo, site.id AS sede_id, site.nombre AS sede
         FROM personal_empleados employee
         INNER JOIN personal_cargos role ON role.id = employee.cargo_id
         INNER JOIN sedes site ON site.id = employee.sede_id
        WHERE employee.id = ? AND employee.sede_id = ? LIMIT 1`,
      [employeeId, siteId],
    );
    if (!employees.length) throw new Error('Colaborador no encontrado en la sede.');

    const [attendanceRows] = await pool.query<RowDataPacket[]>(
      `SELECT attendance.id, attendance.fecha, attendance.estado_asistencia,
              attendance.tipo_asistencia, attendance.minutos_tardanza,
              attendance.minutos_tardanza_retorno, schedule.nombre AS horario,
              version.hora_entrada, version.hora_salida, version.tolerancia_entrada_minutos,
              version.almuerzo_habilitado, version.salida_almuerzo_desde,
              version.salida_almuerzo_hasta, version.duracion_almuerzo_minutos,
              version.tolerancia_retorno_minutos, version.umbral_sobretiempo_minutos
         FROM personal_asistencias attendance
         LEFT JOIN personal_horario_versiones version ON version.id = attendance.horario_version_id
         LEFT JOIN personal_horarios schedule ON schedule.id = version.horario_id
        WHERE attendance.empleado_id = ? AND attendance.fecha = ? LIMIT 1`,
      [employeeId, date],
    );
    const attendance = attendanceRows[0] ?? null;
    const attendanceId = attendance ? Number(attendance.id) : null;

    const [marks, overtime, corrections, incidentReviews] = await Promise.all([
      attendanceId ? pool.query<RowDataPacket[]>(
        `SELECT mark.id, mark.tipo_marcacion, mark.hora_marcacion, mark.hora_programada,
                mark.diferencia_programada_minutos, mark.clasificacion_tiempo,
                mark.origen_marcacion, mark.dentro_de_radio, mark.distancia_sede_metros,
                mark.precision_gps, mark.verificacion_identidad, mark.dispositivo_id
           FROM personal_marcaciones mark
          WHERE mark.asistencia_id = ? ORDER BY mark.hora_marcacion, mark.id`, [attendanceId],
      ).then(([rows]) => rows) : Promise.resolve([]),
      attendanceId ? pool.query<RowDataPacket[]>(
        `SELECT request.id, request.marcacion_id, request.tipo_evento,
                request.origen, request.comentario_empleado, request.declarado_en,
                CASE WHEN request.sustento_storage_key IS NULL THEN 0 ELSE 1 END AS tiene_sustento,
                request.sustento_nombre,
                request.minutos_detectados, request.minutos_aprobados,
                request.umbral_aplicado_minutos, request.estado,
                request.comentario_revision, request.revisado_en,
                reviewer.nombre AS revisado_por_nombre
           FROM personal_sobretiempo_solicitudes request
           LEFT JOIN usuarios reviewer ON reviewer.id = request.revisado_por
          WHERE request.asistencia_id = ? ORDER BY request.created_at, request.id`, [attendanceId],
      ).then(([rows]) => rows) : Promise.resolve([]),
      pool.query<RowDataPacket[]>(
        `SELECT correction.id, correction.motivo, correction.created_at,
                user.nombre AS corregido_por_nombre
           FROM personal_correcciones_asistencia correction
           INNER JOIN usuarios user ON user.id = correction.corregido_por
          WHERE correction.empleado_id = ? AND correction.fecha = ?
          ORDER BY correction.created_at DESC, correction.id DESC`, [employeeId, date],
      ).then(([rows]) => rows),
      pool.query<RowDataPacket[]>(
        `SELECT review.id, review.tipo_incidencia, review.decision, review.comentario,
                review.revisado_en, user.nombre AS revisado_por_nombre
           FROM personal_incidencias_asistencia_revisiones review
           INNER JOIN usuarios user ON user.id = review.revisado_por
          WHERE review.empleado_id = ? AND review.fecha = ?
          ORDER BY review.revisado_en DESC, review.id DESC`, [employeeId, date],
      ).then(([rows]) => rows),
    ]);

    return {
      date,
      employee: employees[0],
      attendance,
      marks,
      overtime_requests: overtime,
      corrections,
      incident_reviews: incidentReviews,
    };
  }

  async report(siteId: number, employeeIdValue: unknown, modeValue: unknown, anchorValue: unknown) {
    const employeeId = positiveInteger(employeeIdValue, 'Colaborador');
    const period = attendanceReportRange(modeValue, anchorValue);
    const [employees] = await pool.query<RowDataPacket[]>(
      `SELECT employee.id, employee.codigo_empleado, employee.nombres, employee.apellidos,
              employee.foto, role.nombre AS cargo, site.id AS sede_id, site.nombre AS sede,
              DATE_FORMAT(employee.fecha_ingreso, '%Y-%m-%d') AS fecha_ingreso,
              DATE_FORMAT(employee.fecha_cese, '%Y-%m-%d') AS fecha_cese
         FROM personal_empleados employee
         INNER JOIN personal_cargos role ON role.id = employee.cargo_id
         INNER JOIN sedes site ON site.id = employee.sede_id
        WHERE employee.id = ? AND employee.sede_id = ? LIMIT 1`,
      [employeeId, siteId],
    );
    if (!employees.length) throw new Error('Colaborador no encontrado en la sede.');

    const [attendanceRows, assignmentRows, calendarRows, permissionRows, vacationRows] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `SELECT attendance.id, DATE_FORMAT(attendance.fecha, '%Y-%m-%d') AS fecha,
                attendance.estado_asistencia, attendance.tipo_asistencia,
                attendance.minutos_tardanza, attendance.minutos_tardanza_retorno,
                marks.entrada, marks.salida_almuerzo, marks.regreso, marks.salida,
                COALESCE(overtime.minutos_aprobados, 0) AS minutos_horas_extra,
                justification.id AS justificacion_id,
                justification.estado AS justificacion_estado,
                justification.tipo_incidencia AS justificacion_tipo_incidencia,
                justification.categoria AS justificacion_categoria,
                justification.comentario_revision AS justificacion_comentario_revision
           FROM personal_asistencias attendance
           LEFT JOIN (
             SELECT asistencia_id,
                    DATE_FORMAT(MIN(CASE WHEN tipo_marcacion = 'ENTRADA' THEN hora_marcacion END), '%H:%i:%s') AS entrada,
                    DATE_FORMAT(MIN(CASE WHEN tipo_marcacion = 'SALIDA_ALMUERZO' THEN hora_marcacion END), '%H:%i:%s') AS salida_almuerzo,
                    DATE_FORMAT(MIN(CASE WHEN tipo_marcacion = 'REGRESO' THEN hora_marcacion END), '%H:%i:%s') AS regreso,
                    DATE_FORMAT(MAX(CASE WHEN tipo_marcacion = 'SALIDA' THEN hora_marcacion END), '%H:%i:%s') AS salida
               FROM personal_marcaciones GROUP BY asistencia_id
           ) marks ON marks.asistencia_id = attendance.id
           LEFT JOIN (
             SELECT asistencia_id, SUM(COALESCE(minutos_aprobados, minutos_detectados)) AS minutos_aprobados
               FROM personal_sobretiempo_solicitudes
              WHERE estado = 'APROBADO' GROUP BY asistencia_id
           ) overtime ON overtime.asistencia_id = attendance.id
           LEFT JOIN personal_justificaciones_asistencia justification
             ON justification.id = (
               SELECT candidate.id FROM personal_justificaciones_asistencia candidate
                WHERE candidate.asistencia_id = attendance.id ORDER BY candidate.id DESC LIMIT 1
             )
          WHERE attendance.empleado_id = ? AND attendance.fecha BETWEEN ? AND ?
          ORDER BY attendance.fecha`,
        [employeeId, period.startDate, period.endDate],
      ).then(([rows]) => rows),
      pool.query<RowDataPacket[]>(
        `SELECT id, alcance, sede_id, empleado_id, dia_semana,
                DATE_FORMAT(vigente_desde, '%Y-%m-%d') AS vigente_desde,
                DATE_FORMAT(vigente_hasta, '%Y-%m-%d') AS vigente_hasta
           FROM personal_horario_asignaciones
          WHERE vigente_desde <= ? AND (vigente_hasta IS NULL OR vigente_hasta >= ?)
            AND (alcance = 'EMPRESA' OR (alcance = 'SEDE' AND sede_id = ?)
                 OR (alcance = 'EMPLEADO' AND empleado_id = ?))
          ORDER BY vigente_desde DESC, id DESC`,
        [period.endDate, period.startDate, siteId, employeeId],
      ).then(([rows]) => rows),
      pool.query<RowDataPacket[]>(
        `SELECT id, alcance, sede_id, tipo,
                DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fecha_fin
           FROM personal_calendario_laboral
          WHERE estado = 'ACTIVO' AND fecha_inicio <= ? AND fecha_fin >= ?
            AND (alcance = 'EMPRESA' OR sede_id = ?)
          ORDER BY alcance = 'SEDE' DESC, created_at DESC, id DESC`,
        [period.endDate, period.startDate, siteId],
      ).then(([rows]) => rows),
      pool.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(DATE(fecha_inicio), '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(DATE(fecha_fin), '%Y-%m-%d') AS fecha_fin
           FROM personal_solicitudes_permisos
          WHERE empleado_id = ? AND estado = 'APROBADO'
            AND DATE(fecha_inicio) <= ? AND DATE(fecha_fin) >= ?`,
        [employeeId, period.endDate, period.startDate],
      ).then(([rows]) => rows),
      pool.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fecha_fin FROM personal_vacaciones
          WHERE empleado_id = ? AND estado IN ('APROBADA','PROGRAMADA','EN_CURSO')
            AND fecha_inicio <= ? AND fecha_fin >= ?`,
        [employeeId, period.endDate, period.startDate],
      ).then(([rows]) => rows),
    ]);

    const employee = employees[0];
    const today = businessDate();
    const attendanceByDate = new Map(attendanceRows.map(row => [String(row.fecha), row]));
    const covers = (row: RowDataPacket, date: string, startKey: string, endKey: string) => {
      const start = String(row[startKey]).slice(0, 10);
      const endValue = row[endKey];
      const end = endValue ? String(endValue).slice(0, 10) : '9999-12-31';
      return start <= date && end >= date;
    };
    const hasApprovedRange = (rows: RowDataPacket[], date: string) => rows.some(row =>
      covers(row, date, 'fecha_inicio', 'fecha_fin'));
    const hasRegularSchedule = (date: string) => {
      const weekday = isoWeekday(date);
      return assignmentRows.some(row => Number(row.dia_semana) === weekday
        && covers(row, date, 'vigente_desde', 'vigente_hasta'));
    };
    const workRule = (date: string) => {
      const event = calendarRows.find(row => covers(row, date, 'fecha_inicio', 'fecha_fin'));
      if (event) return String(event.tipo) === 'JORNADA_ESPECIAL';
      return hasRegularSchedule(date);
    };

    const days = datesBetween(period.startDate, period.endDate).map(date => {
      const attendance = attendanceByDate.get(date);
      const outsideEmployment = date < String(employee.fecha_ingreso).slice(0, 10)
        || (employee.fecha_cese && date > String(employee.fecha_cese).slice(0, 10));
      const future = date > today;
      const scheduled = !outsideEmployment && workRule(date);
      let status = attendance ? String(attendance.estado_asistencia) : '';
      if (hasApprovedRange(vacationRows, date) && !['PRESENTE', 'TARDANZA'].includes(status)) status = 'VACACIONES';
      else if (hasApprovedRange(permissionRows, date) && !['PRESENTE', 'TARDANZA'].includes(status)) status = 'PERMISO';
      else if (!status) status = outsideEmployment
        ? 'FUERA_VINCULO'
        : !scheduled ? 'NO_LABORABLE' : future ? 'PROGRAMADO' : 'SIN_REGISTRO';
      return {
        date,
        status,
        scheduled,
        is_future: future,
        attendance_id: attendance ? Number(attendance.id) : null,
        attendance_type: attendance?.tipo_asistencia ? String(attendance.tipo_asistencia) : null,
        delay_minutes: Number(attendance?.minutos_tardanza || 0),
        return_delay_minutes: Number(attendance?.minutos_tardanza_retorno || 0),
        overtime_minutes: Number(attendance?.minutos_horas_extra || 0),
        marks: {
          entry: attendance?.entrada ? String(attendance.entrada) : null,
          lunch_out: attendance?.salida_almuerzo ? String(attendance.salida_almuerzo) : null,
          lunch_return: attendance?.regreso ? String(attendance.regreso) : null,
          exit: attendance?.salida ? String(attendance.salida) : null,
        },
        justification: attendance?.justificacion_id ? {
          id: Number(attendance.justificacion_id),
          status: String(attendance.justificacion_estado),
          incident_type: String(attendance.justificacion_tipo_incidencia),
          category: String(attendance.justificacion_categoria),
          review_comment: attendance.justificacion_comentario_revision
            ? String(attendance.justificacion_comentario_revision) : null,
        } : null,
      };
    });

    const evaluatedDays = days.filter(day => !day.is_future && (day.scheduled
      || ['PRESENTE', 'TARDANZA', 'FALTA', 'PERMISO', 'VACACIONES'].includes(day.status)));
    const attended = evaluatedDays.filter(day => ['PRESENTE', 'TARDANZA'].includes(day.status));
    const onTime = evaluatedDays.filter(day => day.status === 'PRESENTE');
    const late = evaluatedDays.filter(day => day.status === 'TARDANZA');
    const absent = evaluatedDays.filter(day => day.status === 'FALTA');
    const authorized = evaluatedDays.filter(day => ['PERMISO', 'VACACIONES'].includes(day.status));
    const withoutRecord = evaluatedDays.filter(day => day.status === 'SIN_REGISTRO');
    const justified = evaluatedDays.filter(day => day.justification?.status === 'APROBADA');
    const pendingJustifications = evaluatedDays.filter(day => day.justification?.status === 'PENDIENTE');
    const sum = (selector: (day: typeof days[number]) => number) => days.reduce((total, day) => total + selector(day), 0);

    return {
      period: {
        mode: period.mode,
        anchor: period.anchor,
        start_date: period.startDate,
        end_date: period.endDate,
      },
      employee,
      summary: {
        scheduled_days: evaluatedDays.length,
        attended_days: attended.length,
        on_time_days: onTime.length,
        late_days: late.length,
        absent_days: absent.length,
        authorized_days: authorized.length,
        without_record_days: withoutRecord.length,
        justified_incidents: justified.length,
        pending_justifications: pendingJustifications.length,
        delay_minutes: sum(day => day.delay_minutes + day.return_delay_minutes),
        overtime_minutes: sum(day => day.overtime_minutes),
        attendance_rate: evaluatedDays.length ? Math.round((attended.length / evaluatedDays.length) * 1000) / 10 : 0,
        punctuality_rate: attended.length ? Math.round((onTime.length / attended.length) * 1000) / 10 : 0,
      },
      days,
    };
  }

  async reviewOvertime(siteId: number, requestIdValue: unknown, actorUserId: number, input: Record<string, unknown>) {
    const requestId = positiveInteger(requestIdValue, 'Solicitud');
    const decision = String(input.decision ?? '').toUpperCase();
    if (!OVERTIME_DECISIONS.has(decision)) throw new Error('Decisión de horas extra no válida.');
    const comment = auditComment(input.comment);

    return runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT request.id, request.estado, request.marcacion_id,
                request.minutos_detectados, employee.id AS empleado_id
           FROM personal_sobretiempo_solicitudes request
           INNER JOIN personal_empleados employee ON employee.id = request.empleado_id
          WHERE request.id = ? AND employee.sede_id = ? LIMIT 1 FOR UPDATE`,
        [requestId, siteId],
      );
      if (!rows.length) throw new Error('Solicitud de horas extra no encontrada.');
      if (String(rows[0].estado) !== 'PENDIENTE') throw new Error('Esta solicitud ya fue resuelta.');
      if (decision === 'APROBAR' && rows[0].marcacion_id === null) {
        throw new Error('La jornada sigue abierta. El colaborador debe registrar la marcación que cierra el sobretiempo.');
      }

      const detected = Number(rows[0].minutos_detectados);
      const requestedApproved = input.approved_minutes === undefined || input.approved_minutes === null
        ? detected : Number(input.approved_minutes);
      if (decision === 'APROBAR' && (!Number.isInteger(requestedApproved) || requestedApproved < 1 || requestedApproved > detected)) {
        throw new Error(`Los minutos aprobados deben estar entre 1 y ${detected}.`);
      }
      const approved = decision === 'APROBAR' ? requestedApproved : null;
      const status = decision === 'APROBAR' ? 'APROBADO' : 'RECHAZADO';
      await connection.query(
        `UPDATE personal_sobretiempo_solicitudes
            SET estado = ?, minutos_aprobados = ?, revisado_por = ?,
                comentario_revision = ?, revisado_en = NOW()
          WHERE id = ?`,
        [status, approved, actorUserId, comment, requestId],
      );
      await connection.query(
        `INSERT INTO personal_auditoria_eventos
          (tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json)
         VALUES ('SOBRETIEMPO_REVISADO', ?, ?, 1, ?, ?)`,
        [rows[0].empleado_id, actorUserId, status, JSON.stringify({
          request_id: requestId,
          detected_minutes: detected,
          approved_minutes: approved,
          comment,
        })],
      );
      await createEmployeeNotification(connection, {
        employeeId: Number(rows[0].empleado_id), type: 'SOBRETIEMPO_RESUELTO',
        title: status === 'APROBADO' ? 'Horas extra aprobadas' : 'Horas extra no aprobadas',
        message: status === 'APROBADO'
          ? `RR. HH. aprobó ${approved} minutos de horas extra.`
          : 'RR. HH. revisó el sobretiempo detectado y no lo aprobó como horas extra.',
        priority: status === 'APROBADO' ? 'INFO' : 'IMPORTANTE', action: 'HISTORIAL',
        referenceType: 'SOBRETIEMPO', referenceId: requestId,
        deduplicationKey: `SOBRETIEMPO:${requestId}:${status}`,
      });
      return { id: requestId, status, detected_minutes: detected, approved_minutes: approved };
    });
  }

  async overtimeEvidence(siteId: number, requestIdValue: unknown) {
    const requestId = positiveInteger(requestIdValue, 'Solicitud');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT request.sustento_storage_key, request.sustento_nombre,
              request.sustento_mime, request.sustento_bytes
         FROM personal_sobretiempo_solicitudes request
         INNER JOIN personal_empleados employee ON employee.id = request.empleado_id
        WHERE request.id = ? AND employee.sede_id = ? LIMIT 1`,
      [requestId, siteId],
    );
    if (!rows.length || !rows[0].sustento_storage_key) {
      throw new Error('La solicitud no tiene una foto de sustento disponible.');
    }
    const buffer = await this.overtimeEvidenceStorage.read(String(rows[0].sustento_storage_key));
    return {
      buffer,
      name: String(rows[0].sustento_nombre || 'sustento-sobretiempo.jpg'),
      mimeType: String(rows[0].sustento_mime || 'image/jpeg'),
      bytes: Number(rows[0].sustento_bytes || buffer.length),
    };
  }

  async reviewIncident(siteId: number, actorUserId: number, input: Record<string, unknown>) {
    const employeeId = positiveInteger(input.employee_id, 'Colaborador');
    const date = attendanceDate(input.date);
    const incidentType = String(input.incident_type ?? '').trim().toUpperCase();
    if (!/^[A-Z_]{3,40}$/.test(incidentType)) throw new Error('Tipo de incidencia no válido.');
    const comment = auditComment(input.comment);

    return runInTransaction(async connection => {
      const [employees] = await connection.query<RowDataPacket[]>(
        `SELECT employee.id, attendance.id AS asistencia_id
           FROM personal_empleados employee
           LEFT JOIN personal_asistencias attendance
             ON attendance.empleado_id = employee.id AND attendance.fecha = ?
          WHERE employee.id = ? AND employee.sede_id = ? LIMIT 1 FOR UPDATE`,
        [date, employeeId, siteId],
      );
      if (!employees.length) throw new Error('Colaborador no encontrado en la sede.');
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_incidencias_asistencia_revisiones
          (empleado_id, asistencia_id, fecha, tipo_incidencia, decision, comentario, revisado_por)
         VALUES (?, ?, ?, ?, 'MANTENER_ESTADO', ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), asistencia_id = VALUES(asistencia_id),
           comentario = VALUES(comentario), revisado_por = VALUES(revisado_por), revisado_en = NOW()`,
        [employeeId, employees[0].asistencia_id ?? null, date, incidentType, comment, actorUserId],
      );
      await connection.query(
        `INSERT INTO personal_auditoria_eventos
          (tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json)
         VALUES ('INCIDENCIA_ASISTENCIA_REVISADA', ?, ?, 1, 'MANTENER_ESTADO', ?)`,
        [employeeId, actorUserId, JSON.stringify({ date, incident_type: incidentType, comment })],
      );
      return { id: result.insertId, employee_id: employeeId, date, incident_type: incidentType };
    });
  }
}
