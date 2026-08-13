import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../core/database/database';
import { businessDate, businessIsoWeekday } from '../../core/utils/time';
import { allowedNextClockTypes } from '../rrhh/domain/attendancePolicy';
import { AttendanceStatus, AttendanceType } from '../rrhh/domain/Asistencia';
import { ClockType } from '../rrhh/domain/Marcacion';

type EmployeeSummaryRow = RowDataPacket & {
  id: number;
  sede_id: number;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  foto: string | null;
  cargo: string;
  sede: string;
};

type ScheduleRow = RowDataPacket & {
  nombre: string;
  hora_entrada: string;
  hora_salida: string;
  tolerancia_minutos: number;
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

export class MobileAttendanceQueryService {
  async today(employeeId: number) {
    const date = businessDate();
    const weekday = businessIsoWeekday();
    const [employeeRows] = await pool.query<EmployeeSummaryRow[]>(
      `SELECT employee.id, employee.sede_id, employee.codigo_empleado, employee.nombres,
              employee.apellidos, employee.foto, role.nombre AS cargo,
              site.nombre AS sede
         FROM personal_empleados employee
         INNER JOIN personal_cargos role ON role.id = employee.cargo_id
         INNER JOIN sedes site ON site.id = employee.sede_id
        WHERE employee.id = ? AND employee.estado = 'ACTIVO'
        LIMIT 1`,
      [employeeId],
    );
    if (!employeeRows.length) throw new Error('Empleado activo no encontrado.');

    const [scheduleRows] = await pool.query<ScheduleRow[]>(
      `SELECT schedule.nombre, schedule.hora_entrada, schedule.hora_salida,
              schedule.tolerancia_minutos
         FROM personal_empleado_horarios assignment
         INNER JOIN personal_horarios schedule ON schedule.id = assignment.horario_id
        WHERE assignment.empleado_id = ? AND assignment.dia_semana = ?
        LIMIT 1`,
      [employeeId, weekday],
    );
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

    return {
      business_date: date,
      server_time: new Date().toISOString(),
      employee: {
        id: Number(employee.id),
        code: employee.codigo_empleado,
        first_name: employee.nombres,
        last_name: employee.apellidos,
        role: employee.cargo,
        site: employee.sede,
        photo: employee.foto,
      },
      schedule: scheduleRows.length ? {
        name: scheduleRows[0].nombre,
        start_time: String(scheduleRows[0].hora_entrada),
        end_time: String(scheduleRows[0].hora_salida),
        tolerance_minutes: Number(scheduleRows[0].tolerancia_minutos),
      } : null,
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
      allowed_next: allowedNextClockTypes(recordedTypes),
      completed: recordedTypes.includes('SALIDA'),
      geofence_configured: Number(geofenceRows[0]?.total || 0) > 0,
    };
  }
}
