import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../core/database/database';
import { businessDate, businessIsoWeekday } from '../../core/utils/time';
import { allowedNextClockTypes } from '../rrhh/domain/attendancePolicy';
import { AttendanceStatus, AttendanceType } from '../rrhh/domain/Asistencia';
import { ClockType } from '../rrhh/domain/Marcacion';
import { findEffectiveSchedule } from '../rrhh/services/ScheduleService';

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

    const scheduleConnection = await pool.getConnection();
    const schedule = await findEffectiveSchedule(scheduleConnection, employeeId, date, weekday)
      .finally(() => scheduleConnection.release());
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
    const [pendingRows] = await pool.query<PendingReviewRow[]>(
      `SELECT id, tipo_marcacion, capturada_en, estado
         FROM personal_solicitudes_marcacion
        WHERE empleado_id = ? AND DATE(capturada_en) = ? AND estado = 'PENDIENTE'
        ORDER BY capturada_en`,
      [employeeId, date],
    );

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
      pending_reviews: pendingRows.map(request => ({
        id: Number(request.id),
        type: request.tipo_marcacion,
        captured_at: new Date(request.capturada_en).toISOString(),
        status: request.estado,
      })),
      allowed_next: pendingRows.length ? [] : allowedNextClockTypes(recordedTypes, schedule?.lunchEnabled ?? true),
      completed: recordedTypes.includes('SALIDA'),
      geofence_configured: Number(geofenceRows[0]?.total || 0) > 0,
    };
  }
}
