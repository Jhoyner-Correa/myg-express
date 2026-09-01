import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../core/database/database';
import { businessClockMinutes, businessDate, businessIsoWeekday, parseClockMinutes } from '../../core/utils/time';
import { findEffectiveSchedule } from '../rrhh/services/ScheduleService';
import { resolveWorkDay } from '../rrhh/services/WorkCalendarService';
import {
  OvertimeEvidenceStorageService,
  StoredOvertimeEvidence,
} from '../rrhh/services/OvertimeEvidenceStorageService';

export type MobileOvertimeEvent = 'ALMUERZO_DIFERIDO' | 'SALIDA_POSTERIOR';

export class MobileOvertimeError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 422) {
    super(message);
    this.name = 'MobileOvertimeError';
  }
}

type AttendanceRow = RowDataPacket & { id: number; sede_id: number };
type ExistingRequestRow = RowDataPacket & { id: number; estado: string; sustento_storage_key: string | null };

function normalizeComment(value: unknown) {
  const comment = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (comment.length < 10 || comment.length > 500) {
    throw new MobileOvertimeError(
      'INVALID_OVERTIME_COMMENT',
      'Describe el trabajo realizado en un texto de 10 a 500 caracteres.',
    );
  }
  return comment;
}

function parseEvent(value: unknown): MobileOvertimeEvent {
  if (value === 'ALMUERZO_DIFERIDO' || value === 'SALIDA_POSTERIOR') return value;
  throw new MobileOvertimeError('INVALID_OVERTIME_EVENT', 'El tipo de sobretiempo no es válido.');
}

export function detectedOvertimeMinutes(nowMinutes: number, scheduledClock: string): number {
  if (!Number.isInteger(nowMinutes) || nowMinutes < 0 || nowMinutes >= 1440) {
    throw new MobileOvertimeError('INVALID_OVERTIME_CLOCK', 'No se pudo validar la hora actual.');
  }
  return Math.max(0, nowMinutes - parseClockMinutes(scheduledClock));
}

export class MobileOvertimeService {
  constructor(private evidenceStorage = new OvertimeEvidenceStorageService()) {}

  async declare(employeeId: number, input: Record<string, unknown>, file?: Express.Multer.File) {
    if (!file) {
      throw new MobileOvertimeError('OVERTIME_EVIDENCE_REQUIRED', 'Toma una foto que sustente el trabajo adicional.');
    }
    const event = parseEvent(input.event_type);
    const comment = normalizeComment(input.comment);
    const date = businessDate();
    const weekday = businessIsoWeekday();
    const nowMinutes = businessClockMinutes(new Date());
    let stored: StoredOvertimeEvidence | null = null;
    let oldStorageKey: string | null = null;

    try {
      stored = await this.evidenceStorage.save(file.buffer, file.mimetype);
      const result = await runInTransaction(async connection => {
        const [attendanceRows] = await connection.query<AttendanceRow[]>(
          `SELECT attendance.id, employee.sede_id
             FROM personal_asistencias attendance
             INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
            WHERE attendance.empleado_id = ? AND attendance.fecha = ?
            LIMIT 1 FOR UPDATE`,
          [employeeId, date],
        );
        if (!attendanceRows.length) {
          throw new MobileOvertimeError(
            'ATTENDANCE_ENTRY_REQUIRED',
            'Primero debes registrar tu entrada antes de sustentar horas extra.',
          );
        }
        const attendance = attendanceRows[0];
        const workDay = await resolveWorkDay(connection, attendance.sede_id, date);
        const schedule = workDay.scheduleOverride ?? (workDay.working
          ? await findEffectiveSchedule(connection, employeeId, date, weekday)
          : null);
        if (!schedule) throw new MobileOvertimeError('SCHEDULE_NOT_FOUND', 'No existe una jornada aplicable para hoy.');

        const markType = event === 'ALMUERZO_DIFERIDO' ? 'SALIDA_ALMUERZO' : 'SALIDA';
        const [markRows] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM personal_marcaciones
            WHERE asistencia_id = ? AND tipo_marcacion = ? LIMIT 1`,
          [attendance.id, markType],
        );
        if (markRows.length) {
          throw new MobileOvertimeError(
            'OVERTIME_SEGMENT_CLOSED',
            event === 'ALMUERZO_DIFERIDO'
              ? 'La salida a almuerzo ya fue registrada.'
              : 'La salida final ya fue registrada.',
          );
        }

        const scheduledMinutes = event === 'ALMUERZO_DIFERIDO'
          ? schedule.lunchStartFrom
          : schedule.endTime;
        if (event === 'ALMUERZO_DIFERIDO' && !schedule.lunchEnabled) {
          throw new MobileOvertimeError('LUNCH_NOT_ENABLED', 'Tu jornada no controla salida a almuerzo.');
        }
        if (scheduledMinutes === null) {
          throw new MobileOvertimeError('OVERTIME_SCHEDULE_INVALID', 'La jornada no tiene una hora válida para calcular el sobretiempo.');
        }
        const threshold = Math.max(0, schedule.overtimeThresholdMinutes);
        const detected = detectedOvertimeMinutes(nowMinutes, scheduledMinutes);
        if (detected < threshold) {
          throw new MobileOvertimeError(
            'OVERTIME_NOT_AVAILABLE',
            'El sustento estará disponible cuando se cumpla el umbral de horas extra.',
            409,
          );
        }

        const [existingRows] = await connection.query<ExistingRequestRow[]>(
          `SELECT id, estado, sustento_storage_key
             FROM personal_sobretiempo_solicitudes
            WHERE asistencia_id = ? AND tipo_evento = ? LIMIT 1 FOR UPDATE`,
          [attendance.id, event],
        );
        if (existingRows.length && existingRows[0].estado !== 'PENDIENTE') {
          throw new MobileOvertimeError('OVERTIME_ALREADY_RESOLVED', 'Esta solicitud ya fue resuelta.', 409);
        }
        oldStorageKey = existingRows[0]?.sustento_storage_key ?? null;

        const params = [
          attendance.id, employeeId, event, detected, threshold, comment,
          stored!.storageKey, file.originalname.slice(0, 255), stored!.mimeType,
          stored!.bytes, stored!.sha256,
        ];
        const [insert] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_sobretiempo_solicitudes (
             asistencia_id, empleado_id, marcacion_id, tipo_evento, origen,
             minutos_detectados, umbral_aplicado_minutos, comentario_empleado,
             sustento_storage_key, sustento_nombre, sustento_mime, sustento_bytes,
             sustento_sha256, declarado_en
           ) VALUES (?, ?, NULL, ?, 'DECLARACION_EMPLEADO', ?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             origen = 'DECLARACION_EMPLEADO', minutos_detectados = VALUES(minutos_detectados),
             umbral_aplicado_minutos = VALUES(umbral_aplicado_minutos),
             comentario_empleado = VALUES(comentario_empleado),
             sustento_storage_key = VALUES(sustento_storage_key),
             sustento_nombre = VALUES(sustento_nombre), sustento_mime = VALUES(sustento_mime),
             sustento_bytes = VALUES(sustento_bytes), sustento_sha256 = VALUES(sustento_sha256),
             declarado_en = NOW(), updated_at = CURRENT_TIMESTAMP`,
          params,
        );
        const requestId = existingRows[0]?.id ?? insert.insertId;
        await connection.query(
          `INSERT INTO personal_auditoria_eventos
             (tipo_evento, empleado_id, exitoso, codigo_resultado, metadata_json)
           VALUES ('SOBRETIEMPO_DECLARADO', ?, 1, 'PENDIENTE_CIERRE', ?)`,
          [employeeId, JSON.stringify({ request_id: requestId, event_type: event, detected_minutes: detected })],
        );
        return { id: Number(requestId), event_type: event, detected_minutes: detected, status: 'PENDIENTE_CIERRE' };
      });
      if (oldStorageKey && oldStorageKey !== stored.storageKey) await this.evidenceStorage.remove(oldStorageKey);
      return result;
    } catch (error) {
      if (stored) await this.evidenceStorage.remove(stored.storageKey);
      throw error;
    }
  }
}
