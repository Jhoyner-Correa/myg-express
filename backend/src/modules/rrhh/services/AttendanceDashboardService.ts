import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../core/database/database';
import { assertDateOnly, businessClockMinutes, businessDate, businessIsoWeekday } from '../../../core/utils/time';
import {
  AttendanceNextAction,
  AttendanceOperationalStatus,
  deriveAttendanceOperationalState,
} from '../domain/attendanceOperationalState';
import { resolveWorkDay } from './WorkCalendarService';

type DashboardRow = RowDataPacket & {
  empleado_id: number;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  cargo_nombre: string;
  asistencia_id: number | null;
  estado_asistencia_efectivo: string | null;
  minutos_tardanza: number | null;
  minutos_tardanza_retorno: number | null;
  horario_nombre: string | null;
  hora_entrada_programada: string | null;
  hora_salida_programada: string | null;
  tolerancia_entrada_minutos: number | null;
  almuerzo_habilitado: number | null;
  salida_almuerzo_desde: string | null;
  salida_almuerzo_hasta: string | null;
  duracion_almuerzo_minutos: number | null;
  tolerancia_retorno_minutos: number | null;
  entrada: Date | null;
  salida_almuerzo: Date | null;
  regreso: Date | null;
  salida: Date | null;
  minutos_sobretiempo_aprobados: number | null;
  minutos_sobretiempo_detectados: number | null;
  minutos_sobretiempo_pendientes: number | null;
  solicitudes_sobretiempo_pendientes: number | null;
  justificacion_id: number | null;
  justificacion_estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA' | null;
  justificacion_tipo_incidencia: 'TARDANZA' | 'INASISTENCIA' | null;
  justificacion_categoria: 'MEDICO' | 'EMERGENCIA_FAMILIAR' | 'TRANSPORTE' | 'OTRO' | null;
  justificacion_comentario_revision: string | null;
  justificacion_revisada_en: Date | null;
};

export type AttendanceDashboardItem = {
  employee_id: number;
  site_id: number;
  site_name: string;
  employee_code: string;
  names: string;
  last_names: string;
  job_role: string;
  attendance_id: number | null;
  status: string;
  delay_minutes: number;
  overtime_minutes: number;
  overtime_detected_minutes: number;
  overtime_pending_minutes: number;
  overtime_review_pending: boolean;
  return_delay_minutes: number;
  operational_status: AttendanceOperationalStatus;
  next_action: AttendanceNextAction;
  requires_attention: boolean;
  completed_marks: number;
  expected_marks: 2 | 4;
  schedule: {
    name: string;
    start_time: string;
    end_time: string;
    tolerance_minutes: number;
    lunch_enabled: boolean;
    lunch_start_from: string | null;
    lunch_start_until: string | null;
    lunch_duration_minutes: number;
    return_tolerance_minutes: number;
  } | null;
  marks: { entry: Date | null; lunch_out: Date | null; lunch_return: Date | null; exit: Date | null };
  justification: null | {
    id: number;
    status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';
    incident_type: 'TARDANZA' | 'INASISTENCIA';
    category: 'MEDICO' | 'EMERGENCIA_FAMILIAR' | 'TRANSPORTE' | 'OTRO';
    resolution_comment: string | null;
    resolved_at: Date | null;
  };
};

export function summarizeAttendance(items: AttendanceDashboardItem[]) {
  return {
    total_employees: items.length,
    present: items.filter(item => ['PRESENTE', 'TARDANZA'].includes(item.status)).length,
    on_time: items.filter(item => item.status === 'PRESENTE').length,
    late: items.filter(item => item.status === 'TARDANZA').length,
    without_record: items.filter(item => item.status === 'SIN_REGISTRO').length,
    authorized_absence: items.filter(item => ['PERMISO', 'VACACIONES'].includes(item.status)).length,
    non_working: items.filter(item => item.status === 'NO_LABORABLE').length,
    completed: items.filter(item => item.marks.exit !== null).length,
    overtime_minutes: items.reduce((total, item) => total + item.overtime_minutes, 0),
    justified_incidents: items.filter(item => item.justification?.status === 'APROBADA').length,
    pending_justifications: items.filter(item => item.justification?.status === 'PENDIENTE').length,
    rejected_justifications: items.filter(item => item.justification?.status === 'RECHAZADA').length,
  };
}

function validateDate(value: unknown): string {
  const date = assertDateOnly(value);
  const parsed = new Date(`${date}T12:00:00-05:00`);
  if (Number.isNaN(parsed.getTime()) || businessDate(parsed) !== date) {
    throw new Error('La fecha consultada no es válida.');
  }
  return date;
}

export class AttendanceDashboardService {
  async getTrend(siteId: number | null, requestedFrom: unknown, requestedUntil: unknown, companyId: number | null) {
    const from = validateDate(requestedFrom);
    const until = validateDate(requestedUntil);
    const start = Date.parse(`${from}T12:00:00Z`);
    const end = Date.parse(`${until}T12:00:00Z`);
    const totalDays = Math.floor((end - start) / 86_400_000) + 1;
    if (totalDays < 1 || totalDays > 31) {
      throw new Error('El rango de tendencia debe contener entre 1 y 31 días.');
    }

    const dates = Array.from({ length: totalDays }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
    const dashboards = await Promise.all(dates.map(date => this.getDashboard(siteId, date, companyId)));
    return dashboards.map(dashboard => {
      const working = dashboard.employees.filter(item => item.status !== 'NO_LABORABLE');
      const present = working.filter(item => ['PRESENTE', 'TARDANZA'].includes(item.status)).length;
      const late = working.filter(item => item.status === 'TARDANZA').length;
      const absences = working.filter(item => ['FALTA', 'SIN_REGISTRO'].includes(item.status)).length;
      const authorized = working.filter(item => ['PERMISO', 'VACACIONES'].includes(item.status)).length;
      return {
        date: dashboard.date,
        working_employees: working.length,
        present,
        late,
        absences,
        authorized_absences: authorized,
        attendance_rate: working.length ? Math.round(present / working.length * 1000) / 10 : null,
        tardiness_rate: working.length ? Math.round(late / working.length * 1000) / 10 : null,
      };
    });
  }

  async getDashboard(siteId: number | null, requestedDate: unknown, companyId: number | null) {
    const date = validateDate(requestedDate);
    const [siteRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, nombre
         FROM sedes
        WHERE estado = 'activo'
          AND (? IS NULL OR empresa_id = ?)
          AND (? IS NULL OR id = ?)
        ORDER BY nombre ASC`,
      [companyId, companyId, siteId, siteId],
    );
    if (siteId !== null && siteRows.length === 0) {
      throw new Error('La sede solicitada no pertenece al alcance autorizado.');
    }

    const dashboards = await Promise.all(siteRows.map(site => this.getDailyDashboard(
      Number(site.id),
      date,
      String(site.nombre),
    )));
    if (siteId !== null) return dashboards[0];

    const employees = dashboards
      .flatMap(dashboard => dashboard.employees)
      .sort((left, right) => left.site_name.localeCompare(right.site_name, 'es')
        || left.last_names.localeCompare(right.last_names, 'es')
        || left.names.localeCompare(right.names, 'es'));
    return {
      date,
      scope: 'EMPRESA' as const,
      site_id: null,
      work_day: null,
      summary: summarizeAttendance(employees),
      employees,
    };
  }

  async getDailyDashboard(siteId: number, requestedDate: unknown, siteName = '') {
    const date = validateDate(requestedDate);
    const weekday = businessIsoWeekday(new Date(`${date}T12:00:00-05:00`));
    const calendarConnection = await pool.getConnection();
    const workDay = await resolveWorkDay(calendarConnection, siteId, date)
      .finally(() => calendarConnection.release());
    const [rows] = await pool.query<DashboardRow[]>(
      `SELECT employee.id AS empleado_id, employee.codigo_empleado, employee.nombres,
              employee.apellidos, role.nombre AS cargo_nombre,
              attendance.id AS asistencia_id,
              CASE WHEN attendance.estado_asistencia IN ('PRESENTE','TARDANZA')
                     THEN attendance.estado_asistencia
                   WHEN vacation.empleado_id IS NOT NULL THEN 'VACACIONES'
                   WHEN permission.empleado_id IS NOT NULL THEN 'PERMISO'
                   ELSE attendance.estado_asistencia
              END AS estado_asistencia_efectivo,
              attendance.minutos_tardanza, attendance.minutos_tardanza_retorno,
              schedule.nombre AS horario_nombre,
              COALESCE(attendance_version.hora_entrada, effective_version.hora_entrada) AS hora_entrada_programada,
              COALESCE(attendance_version.hora_salida, effective_version.hora_salida) AS hora_salida_programada,
              COALESCE(attendance_version.tolerancia_entrada_minutos, effective_version.tolerancia_entrada_minutos) AS tolerancia_entrada_minutos,
              COALESCE(attendance_version.almuerzo_habilitado, effective_version.almuerzo_habilitado) AS almuerzo_habilitado,
              COALESCE(attendance_version.salida_almuerzo_desde, effective_version.salida_almuerzo_desde) AS salida_almuerzo_desde,
              COALESCE(attendance_version.salida_almuerzo_hasta, effective_version.salida_almuerzo_hasta) AS salida_almuerzo_hasta,
              COALESCE(attendance_version.duracion_almuerzo_minutos, effective_version.duracion_almuerzo_minutos) AS duracion_almuerzo_minutos,
              COALESCE(attendance_version.tolerancia_retorno_minutos, effective_version.tolerancia_retorno_minutos) AS tolerancia_retorno_minutos,
              marks.entrada, marks.salida_almuerzo, marks.regreso, marks.salida,
              COALESCE(overtime.minutos_aprobados, 0) AS minutos_sobretiempo_aprobados,
              COALESCE(overtime.minutos_detectados, 0) AS minutos_sobretiempo_detectados,
              COALESCE(overtime.minutos_pendientes, 0) AS minutos_sobretiempo_pendientes,
              COALESCE(overtime.solicitudes_pendientes, 0) AS solicitudes_sobretiempo_pendientes,
              justification.id AS justificacion_id,
              justification.estado AS justificacion_estado,
              justification.tipo_incidencia AS justificacion_tipo_incidencia,
              justification.categoria AS justificacion_categoria,
              justification.comentario_revision AS justificacion_comentario_revision,
              justification.revisado_en AS justificacion_revisada_en
         FROM personal_empleados employee
         INNER JOIN personal_cargos role ON role.id = employee.cargo_id
         LEFT JOIN personal_asistencias attendance
           ON attendance.empleado_id = employee.id AND attendance.fecha = ?
         LEFT JOIN personal_justificaciones_asistencia justification
           ON justification.id = (
             SELECT candidate.id
               FROM personal_justificaciones_asistencia candidate
              WHERE candidate.asistencia_id = attendance.id
              ORDER BY candidate.id DESC
              LIMIT 1
           )
         LEFT JOIN personal_horario_asignaciones assignment
           ON assignment.id = (
             SELECT candidate.id
             FROM personal_horario_asignaciones candidate
             WHERE candidate.dia_semana = ?
               AND candidate.vigente_desde <= ?
               AND (candidate.vigente_hasta IS NULL OR candidate.vigente_hasta >= ?)
               AND (
                 candidate.alcance = 'EMPRESA'
                 OR (candidate.alcance = 'SEDE' AND candidate.sede_id = employee.sede_id)
                 OR (candidate.alcance = 'EMPLEADO' AND candidate.empleado_id = employee.id)
               )
             ORDER BY CASE candidate.alcance WHEN 'EMPLEADO' THEN 3 WHEN 'SEDE' THEN 2 ELSE 1 END DESC,
                      candidate.vigente_desde DESC, candidate.id DESC
             LIMIT 1
           )
         LEFT JOIN personal_horario_versiones effective_version
           ON effective_version.horario_id = assignment.horario_id
          AND effective_version.vigente_desde <= ?
          AND (effective_version.vigente_hasta IS NULL OR effective_version.vigente_hasta >= ?)
         LEFT JOIN personal_horario_versiones attendance_version
           ON attendance_version.id = attendance.horario_version_id
         LEFT JOIN personal_horarios schedule
           ON schedule.id = COALESCE(attendance_version.horario_id, assignment.horario_id)
         LEFT JOIN (
           SELECT DISTINCT empleado_id FROM personal_solicitudes_permisos
            WHERE estado = 'APROBADO' AND DATE(?) BETWEEN DATE(fecha_inicio) AND DATE(fecha_fin)
         ) permission ON permission.empleado_id = employee.id
         LEFT JOIN (
           SELECT DISTINCT empleado_id FROM personal_vacaciones
            WHERE estado IN ('APROBADA','PROGRAMADA','EN_CURSO') AND ? BETWEEN fecha_inicio AND fecha_fin
         ) vacation ON vacation.empleado_id = employee.id
         LEFT JOIN (
           SELECT asistencia_id,
                  MIN(CASE WHEN tipo_marcacion = 'ENTRADA' THEN hora_marcacion END) AS entrada,
                  MIN(CASE WHEN tipo_marcacion = 'SALIDA_ALMUERZO' THEN hora_marcacion END) AS salida_almuerzo,
                  MIN(CASE WHEN tipo_marcacion = 'REGRESO' THEN hora_marcacion END) AS regreso,
                  MAX(CASE WHEN tipo_marcacion = 'SALIDA' THEN hora_marcacion END) AS salida
             FROM personal_marcaciones
            WHERE hora_marcacion >= ? AND hora_marcacion < DATE_ADD(?, INTERVAL 1 DAY)
            GROUP BY asistencia_id
         ) marks ON marks.asistencia_id = attendance.id
         LEFT JOIN (
           SELECT asistencia_id,
                  SUM(minutos_detectados) AS minutos_detectados,
                  SUM(CASE WHEN estado = 'APROBADO'
                    THEN COALESCE(minutos_aprobados, minutos_detectados) ELSE 0 END) AS minutos_aprobados,
                  SUM(CASE WHEN estado = 'PENDIENTE' THEN minutos_detectados ELSE 0 END) AS minutos_pendientes,
                  SUM(CASE WHEN estado = 'PENDIENTE' THEN 1 ELSE 0 END) AS solicitudes_pendientes
             FROM personal_sobretiempo_solicitudes
            GROUP BY asistencia_id
         ) overtime ON overtime.asistencia_id = attendance.id
        WHERE employee.sede_id = ?
          AND employee.fecha_ingreso <= ?
          AND (employee.fecha_cese IS NULL OR employee.fecha_cese >= ?)
          AND (employee.estado = 'ACTIVO' OR employee.fecha_cese IS NOT NULL)
        ORDER BY employee.apellidos ASC, employee.nombres ASC`,
      [date, weekday, date, date, date, date, date, date, date, date, siteId, date, date],
    );

    const override = workDay.scheduleOverride;
    const baseItems = rows.map(row => ({
      employee_id: Number(row.empleado_id),
      site_id: siteId,
      site_name: siteName,
      employee_code: String(row.codigo_empleado),
      names: String(row.nombres),
      last_names: String(row.apellidos),
      job_role: String(row.cargo_nombre),
      attendance_id: row.asistencia_id === null ? null : Number(row.asistencia_id),
      status: row.asistencia_id !== null && row.estado_asistencia_efectivo
        ? String(row.estado_asistencia_efectivo)
        : (!workDay.working || (!override && !row.horario_nombre)
            ? 'NO_LABORABLE'
            : row.estado_asistencia_efectivo ? String(row.estado_asistencia_efectivo) : 'SIN_REGISTRO'),
      delay_minutes: Number(row.minutos_tardanza || 0),
      return_delay_minutes: Number(row.minutos_tardanza_retorno || 0),
      overtime_minutes: Number(row.minutos_sobretiempo_aprobados || 0),
      overtime_detected_minutes: Number(row.minutos_sobretiempo_detectados || 0),
      overtime_pending_minutes: Number(row.minutos_sobretiempo_pendientes || 0),
      overtime_review_pending: Number(row.solicitudes_sobretiempo_pendientes || 0) > 0,
      schedule: override && row.asistencia_id === null ? {
        name: override.name,
        start_time: override.startTime,
        end_time: override.endTime,
        tolerance_minutes: override.toleranceMinutes,
        lunch_enabled: override.lunchEnabled,
        lunch_start_from: override.lunchStartFrom,
        lunch_start_until: override.lunchStartUntil,
        lunch_duration_minutes: override.lunchDurationMinutes,
        return_tolerance_minutes: override.returnToleranceMinutes,
      } : row.horario_nombre ? {
          name: String(row.horario_nombre),
          start_time: String(row.hora_entrada_programada),
          end_time: String(row.hora_salida_programada),
          tolerance_minutes: Number(row.tolerancia_entrada_minutos || 0),
          lunch_enabled: Boolean(row.almuerzo_habilitado),
          lunch_start_from: row.salida_almuerzo_desde ? String(row.salida_almuerzo_desde) : null,
          lunch_start_until: row.salida_almuerzo_hasta ? String(row.salida_almuerzo_hasta) : null,
          lunch_duration_minutes: Number(row.duracion_almuerzo_minutos || 0),
          return_tolerance_minutes: Number(row.tolerancia_retorno_minutos || 0),
        } : null,
      marks: {
        entry: row.entrada,
        lunch_out: row.salida_almuerzo,
        lunch_return: row.regreso,
        exit: row.salida,
      },
      justification: row.justificacion_id === null ? null : {
        id: Number(row.justificacion_id),
        status: row.justificacion_estado!,
        incident_type: row.justificacion_tipo_incidencia!,
        category: row.justificacion_categoria!,
        resolution_comment: row.justificacion_comentario_revision,
        resolved_at: row.justificacion_revisada_en,
      },
    }));
    const now = new Date();
    const today = businessDate(now);
    const currentMinutes = businessClockMinutes(now);
    const items: AttendanceDashboardItem[] = baseItems.map(item => ({
      ...item,
      ...deriveAttendanceOperationalState({
        date,
        today,
        current_minutes: currentMinutes,
        status: item.status,
        schedule: item.schedule,
        marks: item.marks,
      }),
    }));
    return {
      date,
      scope: 'SEDE' as const,
      site_id: siteId,
      work_day: {
        working: workDay.working,
        reason: workDay.reason,
        name: workDay.event?.name ?? null,
        scope: workDay.event?.scope ?? null,
      },
      summary: summarizeAttendance(items),
      employees: items,
    };
  }
}
