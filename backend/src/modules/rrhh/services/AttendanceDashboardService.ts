import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../core/database/database';
import { assertDateOnly, businessClockMinutes, businessDate, businessIsoWeekday, parseClockMinutes } from '../../../core/utils/time';
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
  horario_nombre: string | null;
  hora_entrada_programada: string | null;
  hora_salida_programada: string | null;
  almuerzo_habilitado: number | null;
  salida_almuerzo_desde: string | null;
  salida_almuerzo_hasta: string | null;
  duracion_almuerzo_minutos: number | null;
  tolerancia_retorno_minutos: number | null;
  entrada: Date | null;
  salida_almuerzo: Date | null;
  regreso: Date | null;
  salida: Date | null;
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
  schedule: {
    name: string;
    start_time: string;
    end_time: string;
    lunch_enabled: boolean;
    lunch_start_from: string | null;
    lunch_start_until: string | null;
    lunch_duration_minutes: number;
    return_tolerance_minutes: number;
  } | null;
  marks: { entry: Date | null; lunch_out: Date | null; lunch_return: Date | null; exit: Date | null };
};

export function calculateOvertimeMinutes(exit: Date | null, scheduledEnd: string | null): number {
  if (!exit || !scheduledEnd) return 0;
  return Math.max(0, businessClockMinutes(exit) - parseClockMinutes(scheduledEnd));
}

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
              attendance.minutos_tardanza, schedule.nombre AS horario_nombre,
              COALESCE(attendance_version.hora_entrada, effective_version.hora_entrada) AS hora_entrada_programada,
              COALESCE(attendance_version.hora_salida, effective_version.hora_salida) AS hora_salida_programada,
              COALESCE(attendance_version.almuerzo_habilitado, effective_version.almuerzo_habilitado) AS almuerzo_habilitado,
              COALESCE(attendance_version.salida_almuerzo_desde, effective_version.salida_almuerzo_desde) AS salida_almuerzo_desde,
              COALESCE(attendance_version.salida_almuerzo_hasta, effective_version.salida_almuerzo_hasta) AS salida_almuerzo_hasta,
              COALESCE(attendance_version.duracion_almuerzo_minutos, effective_version.duracion_almuerzo_minutos) AS duracion_almuerzo_minutos,
              COALESCE(attendance_version.tolerancia_retorno_minutos, effective_version.tolerancia_retorno_minutos) AS tolerancia_retorno_minutos,
              marks.entrada, marks.salida_almuerzo, marks.regreso, marks.salida
         FROM personal_empleados employee
         INNER JOIN personal_cargos role ON role.id = employee.cargo_id
         LEFT JOIN personal_asistencias attendance
           ON attendance.empleado_id = employee.id AND attendance.fecha = ?
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
        WHERE employee.sede_id = ? AND employee.estado = 'ACTIVO'
        ORDER BY employee.apellidos ASC, employee.nombres ASC`,
      [date, weekday, date, date, date, date, date, date, date, date, siteId],
    );

    const override = workDay.scheduleOverride;
    const items: AttendanceDashboardItem[] = rows.map(row => ({
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
      overtime_minutes: calculateOvertimeMinutes(
        row.salida,
        override && row.asistencia_id === null ? override.endTime : row.hora_salida_programada,
      ),
      schedule: override && row.asistencia_id === null ? {
        name: override.name,
        start_time: override.startTime,
        end_time: override.endTime,
        lunch_enabled: override.lunchEnabled,
        lunch_start_from: override.lunchStartFrom,
        lunch_start_until: override.lunchStartUntil,
        lunch_duration_minutes: override.lunchDurationMinutes,
        return_tolerance_minutes: override.returnToleranceMinutes,
      } : row.horario_nombre ? {
          name: String(row.horario_nombre),
          start_time: String(row.hora_entrada_programada),
          end_time: String(row.hora_salida_programada),
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
