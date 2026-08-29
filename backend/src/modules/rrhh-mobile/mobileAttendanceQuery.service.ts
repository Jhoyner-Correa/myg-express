import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../core/database/database';
import { businessClockMinutes, businessDate, businessIsoWeekday } from '../../core/utils/time';
import { buildClockActions } from '../rrhh/domain/attendancePolicy';
import { AttendanceStatus, AttendanceType } from '../rrhh/domain/Asistencia';
import { ClockType } from '../rrhh/domain/Marcacion';
import { findEffectiveSchedule } from '../rrhh/services/ScheduleService';
import { resolveWorkDay } from '../rrhh/services/WorkCalendarService';
import { attendanceIncidentType, isWithinJustificationWindow } from './mobileAttendanceJustification.service';

type EmployeeSummaryRow = RowDataPacket & {
  id: number;
  sede_id: number;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  sexo: 'M' | 'F';
  foto: string | null;
  cargo: string;
  sede: string;
  tipo_rastreo: 'SOLO_MARCACION' | 'CONTINUO';
};

type AttendanceRow = RowDataPacket & {
  id: number;
  estado_asistencia: AttendanceStatus;
  tipo_asistencia: AttendanceType;
  minutos_tardanza: number;
};

type MarkRow = RowDataPacket & {
  id: number;
  tipo_marcacion: ClockType;
  hora_marcacion: Date;
  origen_marcacion: string;
  dentro_de_radio: number;
  distancia_sede_metros: string | number;
};

type GeofenceCountRow = RowDataPacket & { total: number };
type PendingReviewRow = RowDataPacket & { id: number; tipo_marcacion: ClockType; capturada_en: Date; estado: string };
type OvertimeReviewRow = RowDataPacket & {
  id: number;
  marcacion_id: number | null;
  tipo_evento: 'ALMUERZO_DIFERIDO' | 'SALIDA_POSTERIOR';
  origen: 'DETECCION_AUTOMATICA' | 'DECLARACION_EMPLEADO';
  minutos_detectados: number;
  minutos_aprobados: number | null;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  comentario_empleado: string | null;
  comentario_revision: string | null;
  declarado_en: Date | null;
  revisado_en: Date | null;
  sustento_storage_key: string | null;
};

function clockValueToMinutes(value: string | number | null) {
  if (typeof value === 'number') return value;
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function reminderIso(date: string, clockMinutes: number) {
  const dayOffset = Math.floor(clockMinutes / 1440);
  const normalized = ((clockMinutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  const minutes = String(normalized % 60).padStart(2, '0');
  const reminder = new Date(`${date}T${hours}:${minutes}:00-05:00`);
  if (dayOffset) reminder.setUTCDate(reminder.getUTCDate() + dayOffset);
  return reminder.toISOString();
}

type HistoryAttendanceRow = RowDataPacket & {
  id: number;
  fecha: string;
  estado_asistencia: AttendanceStatus;
  minutos_tardanza: number;
  minutos_sobretiempo_aprobados: number;
  justificacion_id: number | null;
  justificacion_tipo: 'TARDANZA' | 'INASISTENCIA' | null;
  justificacion_categoria: string | null;
  justificacion_motivo: string | null;
  justificacion_estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA' | null;
  justificacion_comentario: string | null;
  justificacion_creada_en: Date | null;
  justificacion_revisada_en: Date | null;
  justificacion_tiene_sustento: number;
};

type HistoryMarkRow = RowDataPacket & {
  id: number;
  asistencia_id: number;
  tipo_marcacion: ClockType;
  hora_marcacion: Date;
};

export class MobileAttendanceQueryService {
  async history(employeeId: number, month: string) {
    const firstDay = `${month}-01`;
    const [attendanceRows] = await pool.query<HistoryAttendanceRow[]>(
      `SELECT attendance.id, DATE_FORMAT(attendance.fecha, '%Y-%m-%d') AS fecha,
              attendance.estado_asistencia, attendance.minutos_tardanza,
              COALESCE(overtime.minutos_aprobados, 0) AS minutos_sobretiempo_aprobados,
              justification.id AS justificacion_id,
              justification.tipo_incidencia AS justificacion_tipo,
              justification.categoria AS justificacion_categoria,
              justification.motivo AS justificacion_motivo,
              justification.estado AS justificacion_estado,
              justification.comentario_revision AS justificacion_comentario,
              justification.created_at AS justificacion_creada_en,
              justification.revisado_en AS justificacion_revisada_en,
              CASE WHEN justification_attachment.id IS NULL THEN 0 ELSE 1 END AS justificacion_tiene_sustento
         FROM personal_asistencias attendance
         LEFT JOIN (
           SELECT asistencia_id,
                  SUM(CASE WHEN estado = 'APROBADO'
                    THEN COALESCE(minutos_aprobados, minutos_detectados) ELSE 0 END) AS minutos_aprobados
             FROM personal_sobretiempo_solicitudes
            GROUP BY asistencia_id
         ) overtime ON overtime.asistencia_id = attendance.id
         LEFT JOIN personal_justificaciones_asistencia justification
           ON justification.id = (
             SELECT MAX(recent.id) FROM personal_justificaciones_asistencia recent
              WHERE recent.asistencia_id = attendance.id
           )
         LEFT JOIN personal_justificacion_asistencia_adjuntos justification_attachment
           ON justification_attachment.justificacion_id = justification.id
        WHERE attendance.empleado_id = ?
          AND attendance.fecha >= ?
          AND attendance.fecha < DATE_ADD(?, INTERVAL 1 MONTH)
        ORDER BY attendance.fecha DESC, attendance.id DESC`,
      [employeeId, firstDay, firstDay],
    );
    const attendanceIds = attendanceRows.map(row => Number(row.id));
    const [markRows] = attendanceIds.length
      ? await pool.query<HistoryMarkRow[]>(
        `SELECT id, asistencia_id, tipo_marcacion, hora_marcacion
           FROM personal_marcaciones
          WHERE asistencia_id IN (${attendanceIds.map(() => '?').join(',')})
          ORDER BY hora_marcacion ASC, id ASC`,
        attendanceIds,
      )
      : [[] as HistoryMarkRow[], []];

    const marksByAttendance = new Map<number, HistoryMarkRow[]>();
    for (const mark of markRows) {
      const attendanceId = Number(mark.asistencia_id);
      const marks = marksByAttendance.get(attendanceId) ?? [];
      marks.push(mark);
      marksByAttendance.set(attendanceId, marks);
    }

    let workedDays = 0;
    let punctualDays = 0;
    let workedMinutes = 0;
    let overtimeMinutes = 0;
    const days = attendanceRows.map(attendance => {
      const marks = marksByAttendance.get(Number(attendance.id)) ?? [];
      const isWorked = ['PRESENTE', 'TARDANZA'].includes(attendance.estado_asistencia)
        && marks.some(mark => mark.tipo_marcacion === 'ENTRADA');
      if (isWorked) {
        workedDays += 1;
        if (Number(attendance.minutos_tardanza || 0) === 0) punctualDays += 1;
      }

      const markByType = new Map<ClockType, HistoryMarkRow>();
      for (const mark of marks) markByType.set(mark.tipo_marcacion, mark);
      const entry = markByType.get('ENTRADA');
      const exit = markByType.get('SALIDA');
      let dayMinutes = 0;
      if (entry && exit) {
        dayMinutes = Math.max(0, Math.round(
          (new Date(exit.hora_marcacion).getTime() - new Date(entry.hora_marcacion).getTime()) / 60000,
        ));
        const lunchExit = markByType.get('SALIDA_ALMUERZO');
        const lunchReturn = markByType.get('REGRESO');
        if (lunchExit && lunchReturn) {
          dayMinutes = Math.max(0, dayMinutes - Math.max(0, Math.round(
            (new Date(lunchReturn.hora_marcacion).getTime() - new Date(lunchExit.hora_marcacion).getTime()) / 60000,
          )));
        }
        workedMinutes += dayMinutes;
      }
      const dayOvertimeMinutes = Number(attendance.minutos_sobretiempo_aprobados || 0);
      overtimeMinutes += dayOvertimeMinutes;

      return {
        attendance_id: Number(attendance.id),
        date: attendance.fecha,
        status: attendance.estado_asistencia,
        delay_minutes: Number(attendance.minutos_tardanza || 0),
        worked_minutes: dayMinutes,
        overtime_minutes: dayOvertimeMinutes,
        can_justify: Boolean(attendanceIncidentType(attendance.estado_asistencia, attendance.minutos_tardanza))
          && isWithinJustificationWindow(attendance.fecha)
          && !['PENDIENTE', 'APROBADA'].includes(String(attendance.justificacion_estado || '')),
        justification: attendance.justificacion_id ? {
          id: Number(attendance.justificacion_id),
          incident_type: attendance.justificacion_tipo,
          category: attendance.justificacion_categoria,
          reason: attendance.justificacion_motivo,
          status: attendance.justificacion_estado,
          resolution_comment: attendance.justificacion_comentario,
          submitted_at: attendance.justificacion_creada_en?.toISOString() ?? null,
          resolved_at: attendance.justificacion_revisada_en?.toISOString() ?? null,
          has_evidence: Boolean(attendance.justificacion_tiene_sustento),
          can_cancel: attendance.justificacion_estado === 'PENDIENTE',
        } : null,
        marks: marks.map(mark => ({
          id: Number(mark.id),
          type: mark.tipo_marcacion,
          recorded_at: new Date(mark.hora_marcacion).toISOString(),
        })),
      };
    });

    return {
      month,
      summary: {
        worked_days: workedDays,
        punctuality_percent: workedDays ? Math.round((punctualDays / workedDays) * 100) : 0,
        worked_minutes: workedMinutes,
        overtime_minutes: overtimeMinutes,
      },
      days,
    };
  }

  async today(employeeId: number) {
    const date = businessDate();
    const weekday = businessIsoWeekday();
    const [employeeRows] = await pool.query<EmployeeSummaryRow[]>(
      `SELECT employee.id, employee.sede_id, employee.codigo_empleado, employee.nombres,
              employee.apellidos, employee.sexo, employee.foto, employee.tipo_rastreo, role.nombre AS cargo,
              site.nombre AS sede
         FROM personal_empleados employee
         INNER JOIN personal_cargos role ON role.id = employee.cargo_id
         INNER JOIN sedes site ON site.id = employee.sede_id
        WHERE employee.id = ? AND employee.estado = 'ACTIVO'
        LIMIT 1`,
      [employeeId],
    );
    if (!employeeRows.length) throw new Error('Empleado activo no encontrado.');

    const scheduleConnection = await pool.getConnection();
    const { workDay, schedule } = await (async () => {
      try {
        const resolvedDay = await resolveWorkDay(scheduleConnection, employeeRows[0].sede_id, date);
        const resolvedSchedule = resolvedDay.scheduleOverride ?? (resolvedDay.working
          ? await findEffectiveSchedule(scheduleConnection, employeeId, date, weekday)
          : null);
        return { workDay: resolvedDay, schedule: resolvedSchedule };
      } finally {
        scheduleConnection.release();
      }
    })();
    const [geofenceRows] = await pool.query<GeofenceCountRow[]>(
      `SELECT COUNT(*) AS total
         FROM personal_configuracion_gps_sedes
        WHERE sede_id = ?`,
      [employeeRows[0].sede_id],
    );
    const [attendanceRows] = await pool.query<AttendanceRow[]>(
      `SELECT id, estado_asistencia, tipo_asistencia, minutos_tardanza
         FROM personal_asistencias
        WHERE empleado_id = ? AND fecha = ?
        LIMIT 1`,
      [employeeId, date],
    );
    const attendance = attendanceRows[0] ?? null;
    const [markRows] = attendance
      ? await pool.query<MarkRow[]>(
        `SELECT id, tipo_marcacion, hora_marcacion, origen_marcacion,
                dentro_de_radio, distancia_sede_metros
           FROM personal_marcaciones
          WHERE asistencia_id = ?
          ORDER BY hora_marcacion ASC, id ASC`,
        [attendance.id],
      )
      : [[] as MarkRow[], []];
    const employee = employeeRows[0];
    const recordedTypes = markRows.map((mark) => mark.tipo_marcacion);
    const now = new Date();
    const [pendingRows] = await pool.query<PendingReviewRow[]>(
      `SELECT id, tipo_marcacion, capturada_en, estado
         FROM personal_solicitudes_marcacion
        WHERE empleado_id = ? AND DATE(capturada_en) = ? AND estado = 'PENDIENTE'
        ORDER BY capturada_en`,
      [employeeId, date],
    );
    const [overtimeRows] = attendance
      ? await pool.query<OvertimeReviewRow[]>(
        `SELECT id, marcacion_id, tipo_evento, origen, minutos_detectados, minutos_aprobados,
                estado, comentario_empleado, comentario_revision, declarado_en,
                revisado_en, sustento_storage_key
           FROM personal_sobretiempo_solicitudes
          WHERE asistencia_id = ? ORDER BY created_at, id`,
        [attendance.id],
      )
      : [[] as OvertimeReviewRow[], []];

    const overtimeByEvent = new Map(overtimeRows.map(row => [row.tipo_evento, row]));
    const nowClockMinutes = businessClockMinutes(now);
    const hasEntry = recordedTypes.includes('ENTRADA');
    const overtimeActions = schedule && workDay.working && hasEntry ? ([
      schedule.lunchEnabled && schedule.lunchStartFrom !== null ? {
        eventType: 'ALMUERZO_DIFERIDO' as const,
        closesWith: 'SALIDA_ALMUERZO' as ClockType,
        scheduledMinutes: clockValueToMinutes(schedule.lunchStartFrom),
        title: 'Sobretiempo durante el almuerzo',
      } : null,
      {
        eventType: 'SALIDA_POSTERIOR' as const,
        closesWith: 'SALIDA' as ClockType,
        scheduledMinutes: clockValueToMinutes(schedule.endTime),
        title: 'Horas extra al cierre de jornada',
      },
    ]).filter((item): item is NonNullable<typeof item> => item !== null).map(item => {
      const thresholdAt = item.scheduledMinutes + schedule.overtimeThresholdMinutes;
      const existing = overtimeByEvent.get(item.eventType);
      const closed = recordedTypes.includes(item.closesWith);
      return {
        event_type: item.eventType,
        title: item.title,
        closes_with: item.closesWith,
        reminder_at: reminderIso(date, thresholdAt),
        eligible: !closed && nowClockMinutes >= thresholdAt,
        closed,
        detected_minutes: Math.max(0, nowClockMinutes - item.scheduledMinutes),
        request: existing ? {
          id: Number(existing.id),
          status: existing.estado,
          declared: existing.origen === 'DECLARACION_EMPLEADO',
          segment_closed: existing.marcacion_id !== null,
          has_evidence: Boolean(existing.sustento_storage_key),
        } : null,
      };
    }) : [];

    return {
      business_date: date,
      server_time: now.toISOString(),
      employee: {
        id: Number(employee.id),
        code: employee.codigo_empleado,
        first_name: employee.nombres,
        last_name: employee.apellidos,
        gender: employee.sexo,
        role: employee.cargo,
        site: employee.sede,
        photo: employee.foto,
        tracking_type: employee.tipo_rastreo,
      },
      schedule: schedule ? {
        id: schedule.scheduleId,
        version_id: schedule.versionId,
        name: schedule.name,
        start_time: schedule.startTime,
        end_time: schedule.endTime,
        tolerance_minutes: schedule.toleranceMinutes,
        lunch_enabled: schedule.lunchEnabled,
        lunch_start_from: schedule.lunchStartFrom,
        lunch_start_until: schedule.lunchStartUntil,
        lunch_duration_minutes: schedule.lunchDurationMinutes,
        return_tolerance_minutes: schedule.returnToleranceMinutes,
        entry_open_before_minutes: schedule.entryOpenBeforeMinutes,
        lunch_open_before_minutes: schedule.lunchOpenBeforeMinutes,
        return_open_before_minutes: schedule.returnOpenBeforeMinutes,
        exit_open_before_minutes: schedule.exitOpenBeforeMinutes,
        overtime_threshold_minutes: schedule.overtimeThresholdMinutes,
      } : null,
      work_day: {
        working: workDay.working && schedule !== null,
        reason: workDay.working && schedule === null ? 'DESCANSO_SEMANAL' : workDay.reason,
        name: workDay.event?.name ?? (schedule ? 'Jornada regular' : 'Descanso semanal'),
      },
      attendance: attendance ? {
        id: Number(attendance.id),
        status: attendance.estado_asistencia,
        type: attendance.tipo_asistencia,
        delay_minutes: Number(attendance.minutos_tardanza),
      } : null,
      marks: markRows.map((mark) => ({
        id: Number(mark.id),
        type: mark.tipo_marcacion,
        recorded_at: new Date(mark.hora_marcacion).toISOString(),
        origin: mark.origen_marcacion,
        inside_geofence: Boolean(mark.dentro_de_radio),
        distance_meters: Number(mark.distancia_sede_metros),
      })),
      pending_reviews: pendingRows.map(request => ({
        id: Number(request.id),
        type: request.tipo_marcacion,
        captured_at: new Date(request.capturada_en).toISOString(),
        status: request.estado,
      })),
      overtime_reviews: overtimeRows.map(request => ({
        id: Number(request.id),
        event_type: request.tipo_evento,
        detected_minutes: Number(request.minutos_detectados),
        approved_minutes: request.minutos_aprobados === null ? null : Number(request.minutos_aprobados),
        status: request.estado,
        declared_by_employee: request.origen === 'DECLARACION_EMPLEADO',
        employee_comment: request.comentario_empleado,
        has_evidence: Boolean(request.sustento_storage_key),
        segment_closed: request.marcacion_id !== null,
        declared_at: request.declarado_en ? new Date(request.declarado_en).toISOString() : null,
        review_comment: request.comentario_revision,
        reviewed_at: request.revisado_en ? new Date(request.revisado_en).toISOString() : null,
      })),
      overtime_actions: overtimeActions,
      clock_actions: !workDay.working || !schedule ? [] : buildClockActions(
        recordedTypes, schedule, businessClockMinutes(now),
      ).map(action => ({
        type: action.type,
        state: action.state,
        enabled: action.enabled && pendingRows.length === 0,
        scheduled_time: action.scheduledTime,
        available_from: action.availableFrom,
        minutes_until: action.minutesUntil,
      })),
      allowed_next: pendingRows.length || !workDay.working || !schedule
        ? []
        : buildClockActions(recordedTypes, schedule, businessClockMinutes(now))
          .filter(action => action.enabled)
          .map(action => action.type),
      completed: recordedTypes.includes('SALIDA'),
      geofence_configured: Number(geofenceRows[0]?.total || 0) > 0,
    };
  }
}
