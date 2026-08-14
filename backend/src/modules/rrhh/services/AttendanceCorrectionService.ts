import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { runInTransaction } from '../../../core/database/database';
import { assertDateOnly, businessClockMinutes, businessDate } from '../../../core/utils/time';

const ATTENDANCE_STATUSES = new Set(['PRESENTE', 'TARDANZA', 'FALTA', 'PERMISO', 'VACACIONES']);
const ATTENDANCE_TYPES = new Set(['NORMAL', 'REMOTA', 'COMISION', 'VISITA']);
const CLOCK_TYPES = ['ENTRADA', 'SALIDA_ALMUERZO', 'REGRESO', 'SALIDA'] as const;
type ClockType = (typeof CLOCK_TYPES)[number];

function clock(value: unknown) {
  if (value === null || value === '') return null;
  const text = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error('Las horas deben usar el formato HH:mm.');
  return text;
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
    const status = String(input.status || '').toUpperCase();
    const attendanceType = String(input.attendance_type || 'NORMAL').toUpperCase();
    const reason = String(input.reason || '').trim();
    const delay = status === 'TARDANZA' ? Number(input.delay_minutes) : 0;
    if (!Number.isInteger(employeeId) || employeeId < 1) throw new Error('Colaborador no válido.');
    if (!ATTENDANCE_STATUSES.has(status) || !ATTENDANCE_TYPES.has(attendanceType)) throw new Error('La clasificación de asistencia no es válida.');
    if (reason.length < 8 || reason.length > 500) throw new Error('El motivo debe tener entre 8 y 500 caracteres.');
    if (!Number.isInteger(delay) || delay < 0 || delay > 720 || (status === 'TARDANZA' && delay < 1)) throw new Error('Los minutos de tardanza no son válidos.');
    const rawMarks = input.marks && typeof input.marks === 'object' ? input.marks as Record<string, unknown> : null;

    return runInTransaction(async connection => {
      const [employees] = await connection.query<RowDataPacket[]>(
        `SELECT employee.id,
                COALESCE(gps.latitud, site.latitud, 0) AS latitude,
                COALESCE(gps.longitud, site.longitud, 0) AS longitude
           FROM personal_empleados employee
           INNER JOIN sedes site ON site.id = employee.sede_id
           LEFT JOIN personal_configuracion_gps_sedes gps ON gps.sede_id = employee.sede_id
          WHERE employee.id = ? AND employee.sede_id = ? LIMIT 1`,
        [employeeId, siteId],
      );
      if (!employees.length) throw new Error('Colaborador no encontrado en la sede.');
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
                minutos_tardanza = ? WHERE id = ?`,
        [status, attendanceType, delay, attendanceId],
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
          await connection.query(
            `INSERT INTO personal_marcaciones (
              request_id, asistencia_id, dispositivo_id, tipo_marcacion, origen_marcacion,
              hora_marcacion, latitud, longitud, precision_gps, selfie_path, red_wifi,
              bluetooth, dentro_de_radio, distancia_sede_metros, verificacion_identidad
            ) VALUES (NULL, ?, NULL, ?, 'ADMINISTRATIVO', ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, 'ADMINISTRATIVA')
            ON DUPLICATE KEY UPDATE hora_marcacion = VALUES(hora_marcacion),
              origen_marcacion = 'ADMINISTRATIVO', verificacion_identidad = 'ADMINISTRATIVA'`,
            [attendanceId, type, `${date} ${time}:00`, employees[0].latitude, employees[0].longitude],
          );
        }
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
        [employeeId, actorUserId, JSON.stringify({ correction_id: correction.insertId, attendance_id: attendanceId, date })],
      );
      return { correction_id: correction.insertId, attendance_id: attendanceId };
    });
  }
}
