import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../../core/database/database';
import { assertDateOnly, businessClockMinutes, businessDate, businessIsoWeekday, parseClockMinutes } from '../../../core/utils/time';

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
  async getDailyDashboard(siteId: number, requestedDate: unknown) {
    const date = validateDate(requestedDate);
    const weekday = businessIsoWeekday(new Date(`${date}T12:00:00-05:00`));
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
         LEFT JOIN personal_empleado_horarios assignment
           ON assignment.empleado_id = employee.id AND assignment.dia_semana = ?
          AND assignment.vigente_desde <= ?
          AND (assignment.vigente_hasta IS NULL OR assignment.vigente_hasta >= ?)
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

    const items: AttendanceDashboardItem[] = rows.map(row => ({
      employee_id: Number(row.empleado_id),
      employee_code: String(row.codigo_empleado),
      names: String(row.nombres),
      last_names: String(row.apellidos),
      job_role: String(row.cargo_nombre),
      attendance_id: row.asistencia_id === null ? null : Number(row.asistencia_id),
      status: row.estado_asistencia_efectivo ? String(row.estado_asistencia_efectivo) : 'SIN_REGISTRO',
      delay_minutes: Number(row.minutos_tardanza || 0),
      overtime_minutes: calculateOvertimeMinutes(row.salida, row.hora_salida_programada),
      schedule: row.horario_nombre ? {
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
    return { date, site_id: siteId, summary: summarizeAttendance(items), employees: items };
  }
}
