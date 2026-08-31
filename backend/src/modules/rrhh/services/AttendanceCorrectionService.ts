import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { runInTransaction } from '../../../core/database/database';
import { assertDateOnly, businessClockMinutes, businessDate, businessIsoWeekday } from '../../../core/utils/time';
import { classifyClockTiming, resolveEntryAttendance } from '../domain/attendancePolicy';
import { findEffectiveSchedule, type EffectiveSchedule } from './ScheduleService';
import { resolveWorkDay } from './WorkCalendarService';

const ATTENDANCE_STATUSES = new Set(['PRESENTE', 'TARDANZA', 'FALTA', 'PERMISO', 'VACACIONES']);
const CLOCK_TYPES = ['ENTRADA', 'SALIDA_ALMUERZO', 'REGRESO', 'SALIDA'] as const;
type ClockType = (typeof CLOCK_TYPES)[number];

function clock(value: unknown) {
  if (value === null || value === '') return null;
  const text = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error('Las horas deben usar el formato HH:mm.');
  return text;
}

function clockTextMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

async function snapshot(connection: PoolConnection, attendanceId: number) {
  const [[attendance]] = await connection.query<RowDataPacket[]>(
    `SELECT estado_asistencia, tipo_asistencia, minutos_tardanza
       FROM personal_asistencias WHERE id = ? LIMIT 1`,
    [attendanceId],
  );
  const [marks] = await connection.query<RowDataPacket[]>(
    `SELECT tipo_marcacion, hora_marcacion, origen_marcacion
       FROM personal_marcaciones WHERE asistencia_id = ? ORDER BY hora_marcacion ASC`,
    [attendanceId],
  );
  return { attendance, marks };
}

async function reconcileOvertimeCandidates(
  connection: PoolConnection,
  attendanceId: number,
  employeeId: number,
  thresholdMinutes: number,
) {
  const [marks] = await connection.query<RowDataPacket[]>(
    `SELECT id, tipo_marcacion, diferencia_programada_minutos, clasificacion_tiempo
       FROM personal_marcaciones
      WHERE asistencia_id = ? AND tipo_marcacion IN ('SALIDA_ALMUERZO','SALIDA')`,
    [attendanceId],
  );
  for (const mark of marks) {
    const difference = Math.max(0, Number(mark.diferencia_programada_minutos || 0));
    const event = String(mark.tipo_marcacion) === 'SALIDA_ALMUERZO' && difference >= thresholdMinutes
      ? 'ALMUERZO_DIFERIDO'
      : String(mark.tipo_marcacion) === 'SALIDA' && String(mark.clasificacion_tiempo) === 'SOBRETIEMPO_CANDIDATO'
        ? 'SALIDA_POSTERIOR'
        : null;
    if (!event) {
      await connection.query(
        `DELETE FROM personal_sobretiempo_solicitudes
          WHERE marcacion_id = ? AND origen = 'DETECCION_AUTOMATICA'`,
        [mark.id],
      );
      continue;
    }
    await connection.query(
      `INSERT INTO personal_sobretiempo_solicitudes (
        asistencia_id, empleado_id, marcacion_id, tipo_evento,
        minutos_detectados, umbral_aplicado_minutos
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE minutos_detectados = VALUES(minutos_detectados),
        marcacion_id = VALUES(marcacion_id),
        umbral_aplicado_minutos = VALUES(umbral_aplicado_minutos),
        estado = IF(estado = 'PENDIENTE', 'PENDIENTE', estado)`,
      [attendanceId, employeeId, mark.id, event, difference, thresholdMinutes],
    );
  }
}

export function assertAdministrativeMarks(marks: RowDataPacket[]) {
  const minutes = new Map<string, number>();
  for (const mark of marks) minutes.set(String(mark.tipo_marcacion), businessClockMinutes(new Date(mark.hora_marcacion)));
  if (!minutes.has('ENTRADA')) throw new Error('Una asistencia presente debe conservar una hora de entrada.');
  if (minutes.has('REGRESO') && !minutes.has('SALIDA_ALMUERZO')) throw new Error('No puede existir un regreso sin salida a almuerzo.');
  if (minutes.has('SALIDA_ALMUERZO') && minutes.has('SALIDA') && !minutes.has('REGRESO')) throw new Error('Debes registrar el regreso antes de la salida final.');
  let previous = -1;
  for (const type of CLOCK_TYPES) {
    const value = minutes.get(type);
    if (value === undefined) continue;
    if (value <= previous) throw new Error('Las marcaciones deben conservar su orden cronológico.');
    previous = value;
  }
}

export class AttendanceCorrectionService {
  async correct(siteId: number, actorUserId: number, input: Record<string, unknown>) {
    const employeeId = Number(input.employee_id);
    const date = assertDateOnly(input.date);
    const parsedDate = new Date(`${date}T12:00:00-05:00`);
    if (Number.isNaN(parsedDate.getTime()) || businessDate(parsedDate) !== date) throw new Error('La fecha no es válida.');
    const requestedStatus = String(input.status || '').toUpperCase();
    const attendanceType = 'NORMAL';
    const reason = String(input.reason || '').trim();
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new Error('Colaborador no válido.');
    if (!ATTENDANCE_STATUSES.has(requestedStatus)) throw new Error('El estado de asistencia no es válido.');
    if (reason.length < 8 || reason.length > 500) throw new Error('El motivo debe tener entre 8 y 500 caracteres.');
    const rawMarks = input.marks && typeof input.marks === 'object' ? input.marks as Record<string, unknown> : null;

    return runInTransaction(async connection => {
      const [employees] = await connection.query<RowDataPacket[]>(
        `SELECT employee.id, employee.sede_id,
                COALESCE(gps.latitud, site.latitud, 0) AS latitude,
                COALESCE(gps.longitud, site.longitud, 0) AS longitude
           FROM personal_empleados employee
           INNER JOIN sedes site ON site.id = employee.sede_id
           LEFT JOIN personal_configuracion_gps_sedes gps ON gps.sede_id = employee.sede_id
          WHERE employee.id = ? AND employee.sede_id = ? LIMIT 1`,
        [employeeId, siteId],
      );
      if (!employees.length) throw new Error('Colaborador no encontrado en la sede.');

      let status = requestedStatus;
      let delay = 0;
      let schedule: EffectiveSchedule | null = null;
      let entryTiming: ReturnType<typeof classifyClockTiming> | null = null;
      if (['PRESENTE', 'TARDANZA'].includes(requestedStatus)) {
        const entryTime = rawMarks ? clock(rawMarks.ENTRADA) : null;
        if (!entryTime) throw new Error('Registra la hora de entrada para calcular la asistencia.');
        const workDay = await resolveWorkDay(connection, Number(employees[0].sede_id), date);
        if (!workDay.working) {
          throw new Error('La fecha seleccionada no es laborable. Registra primero una excepción de calendario.');
        }
        schedule = workDay.scheduleOverride ?? await findEffectiveSchedule(
          connection,
          employeeId,
          date,
          businessIsoWeekday(parsedDate),
        );
        if (!schedule) throw new Error('El colaborador no tiene un horario vigente para esta fecha.');
        const automatic = resolveEntryAttendance(clockTextMinutes(entryTime), schedule);
        status = automatic.status;
        delay = automatic.delayMinutes;
        entryTiming = automatic.timing;
      }
      const [existing] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM personal_asistencias WHERE empleado_id = ? AND fecha = ? LIMIT 1 FOR UPDATE',
        [employeeId, date],
      );
      const before = existing.length ? await snapshot(connection, Number(existing[0].id)) : null;
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_asistencias
          (empleado_id, fecha, estado_asistencia, tipo_asistencia, minutos_tardanza)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [employeeId, date, status, attendanceType, delay],
      );
      const attendanceId = result.insertId;
      await connection.query(
        `UPDATE personal_asistencias SET estado_asistencia = ?, tipo_asistencia = ?,
                minutos_tardanza = ?, horario_version_id = COALESCE(?, horario_version_id) WHERE id = ?`,
        [status, attendanceType, delay, schedule?.versionId ?? null, attendanceId],
      );

      if (['FALTA', 'PERMISO', 'VACACIONES'].includes(status)) {
        await connection.query('DELETE FROM personal_marcaciones WHERE asistencia_id = ?', [attendanceId]);
      } else if (rawMarks) {
        for (const type of CLOCK_TYPES) {
          if (!Object.prototype.hasOwnProperty.call(rawMarks, type)) continue;
          const time = clock(rawMarks[type]);
          if (time === null) {
            await connection.query('DELETE FROM personal_marcaciones WHERE asistencia_id = ? AND tipo_marcacion = ?', [attendanceId, type]);
            continue;
          }
          const timing = schedule ? classifyClockTiming(type, clockTextMinutes(time), schedule) : null;
          const scheduledTime = timing
            ? `${String(Math.floor(timing.scheduledMinutes / 60)).padStart(2, '0')}:${String(timing.scheduledMinutes % 60).padStart(2, '0')}:00`
            : null;
          await connection.query(
            `INSERT INTO personal_marcaciones (
              request_id, asistencia_id, dispositivo_id, tipo_marcacion, origen_marcacion,
              hora_marcacion, hora_programada, diferencia_programada_minutos, clasificacion_tiempo,
              latitud, longitud, precision_gps, selfie_path, red_wifi,
              bluetooth, dentro_de_radio, distancia_sede_metros, verificacion_identidad
            ) VALUES (NULL, ?, NULL, ?, 'ADMINISTRATIVO', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, 'ADMINISTRATIVA')
            ON DUPLICATE KEY UPDATE hora_marcacion = VALUES(hora_marcacion),
              hora_programada = VALUES(hora_programada),
              diferencia_programada_minutos = VALUES(diferencia_programada_minutos),
              clasificacion_tiempo = VALUES(clasificacion_tiempo),
              origen_marcacion = 'ADMINISTRATIVO', verificacion_identidad = 'ADMINISTRATIVA'`,
            [attendanceId, type, `${date} ${time}:00`, scheduledTime,
              timing?.differenceMinutes ?? null, timing?.classification ?? null,
              employees[0].latitude, employees[0].longitude],
          );
        }
      }
      if (['PRESENTE', 'TARDANZA'].includes(status) && schedule) {
        await reconcileOvertimeCandidates(
          connection,
          attendanceId,
          employeeId,
          schedule.overtimeThresholdMinutes,
        );
      }
      const after = await snapshot(connection, attendanceId);
      if (['PRESENTE', 'TARDANZA'].includes(status)) assertAdministrativeMarks(after.marks);
      const [correction] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_correcciones_asistencia (
          asistencia_id, empleado_id, fecha, motivo, valores_anteriores_json,
          valores_nuevos_json, corregido_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [attendanceId, employeeId, date, reason, JSON.stringify(before), JSON.stringify(after), actorUserId],
      );
      await connection.query(
        `INSERT INTO personal_auditoria_eventos
          (tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json)
         VALUES ('CORRECCION_ASISTENCIA', ?, ?, 1, 'APLICADA', ?)`,
        [employeeId, actorUserId, JSON.stringify({
          correction_id: correction.insertId,
          attendance_id: attendanceId,
          date,
          requested_status: requestedStatus,
          resolved_status: status,
          delay_minutes: delay,
          calculation_source: schedule ? 'HORARIO_VIGENTE' : 'ESTADO_ADMINISTRATIVO',
          schedule_version_id: schedule?.versionId ?? null,
          scheduled_entry: entryTiming
            ? `${String(Math.floor(entryTiming.scheduledMinutes / 60)).padStart(2, '0')}:${String(entryTiming.scheduledMinutes % 60).padStart(2, '0')}`
            : null,
          entry_difference_minutes: entryTiming?.differenceMinutes ?? null,
        })],
      );
      return { correction_id: correction.insertId, attendance_id: attendanceId, status, delay_minutes: delay };
    });
  }
}
