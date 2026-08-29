import path from 'path';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { runInTransaction } from '../../core/database/database';
import { businessDate } from '../../core/utils/time';
import { PermissionEvidenceStorageService, StoredPermissionEvidence } from '../rrhh/services/PermissionEvidenceStorageService';

const CATEGORIES = new Set(['MEDICO', 'EMERGENCIA_FAMILIAR', 'TRANSPORTE', 'OTRO']);
type EvidenceInput = { buffer: Buffer; mimetype: string; originalname: string };

export function attendanceIncidentType(status: unknown, delayMinutes: unknown): 'TARDANZA' | 'INASISTENCIA' | null {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'FALTA') return 'INASISTENCIA';
  if (normalized === 'TARDANZA' && Number(delayMinutes || 0) > 0) return 'TARDANZA';
  return null;
}

export function isWithinJustificationWindow(attendanceDate: string, currentDate = businessDate()): boolean {
  const day = Date.parse(`${attendanceDate}T12:00:00Z`);
  const current = Date.parse(`${currentDate}T12:00:00Z`);
  if (Number.isNaN(day) || Number.isNaN(current)) return false;
  const ageDays = Math.floor((current - day) / 86_400_000);
  return ageDays >= 0 && ageDays <= 7;
}

export class MobileAttendanceJustificationService {
  constructor(private readonly storage = new PermissionEvidenceStorageService()) {}

  async create(employeeId: number, deviceId: number, input: Record<string, unknown>, evidence?: EvidenceInput) {
    const attendanceId = Number(input.attendance_id);
    const category = String(input.category || '').trim().toUpperCase();
    const reason = String(input.reason || '').trim();
    if (!Number.isInteger(attendanceId) || attendanceId < 1) throw new Error('Selecciona una incidencia de asistencia valida.');
    if (!CATEGORIES.has(category)) throw new Error('Selecciona un motivo valido.');
    if (reason.length < 10 || reason.length > 500) throw new Error('La explicacion debe tener entre 10 y 500 caracteres.');
    if (category === 'MEDICO' && !evidence) throw new Error('Adjunta el sustento medico.');

    let stored: StoredPermissionEvidence | null = null;
    try {
      if (evidence) stored = await this.storage.save(evidence.buffer, evidence.mimetype);
      const id = await runInTransaction(async connection => {
        const [rows] = await connection.query<RowDataPacket[]>(
          `SELECT attendance.id, DATE_FORMAT(attendance.fecha, '%Y-%m-%d') AS fecha,
                  attendance.estado_asistencia, attendance.minutos_tardanza
             FROM personal_asistencias attendance
             INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
            WHERE attendance.id = ? AND attendance.empleado_id = ? AND employee.estado = 'ACTIVO'
            LIMIT 1 FOR UPDATE`,
          [attendanceId, employeeId],
        );
        if (!rows.length) throw new Error('La incidencia ya no esta disponible.');
        const incidentType = attendanceIncidentType(rows[0].estado_asistencia, rows[0].minutos_tardanza);
        if (!incidentType) throw new Error('Solo se pueden justificar tardanzas o inasistencias registradas.');
        if (!isWithinJustificationWindow(String(rows[0].fecha))) {
          throw new Error('El plazo de 7 dias para justificar esta incidencia ya vencio.');
        }
        const [active] = await connection.query<RowDataPacket[]>(
          `SELECT id, estado FROM personal_justificaciones_asistencia
            WHERE asistencia_id = ? AND estado IN ('PENDIENTE','APROBADA') LIMIT 1`,
          [attendanceId],
        );
        if (active.length) throw new Error(active[0].estado === 'PENDIENTE'
          ? 'Esta incidencia ya tiene una justificacion en revision.'
          : 'Esta incidencia ya fue justificada.');
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_justificaciones_asistencia
            (asistencia_id, empleado_id, tipo_incidencia, categoria, motivo, estado, origen_solicitud)
           VALUES (?, ?, ?, ?, ?, 'PENDIENTE', 'MOVIL')`,
          [attendanceId, employeeId, incidentType, category, reason],
        );
        if (stored && evidence) {
          await connection.query(
            `INSERT INTO personal_justificacion_asistencia_adjuntos
              (justificacion_id, storage_key, nombre_original, mime_type, bytes, sha256)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [result.insertId, stored.storageKey,
              path.basename(evidence.originalname || `sustento.${stored.storageKey.split('.').pop()}`).slice(0, 255),
              stored.mimeType, stored.bytes, stored.sha256],
          );
        }
        await connection.query(
          `INSERT INTO personal_auditoria_eventos
            (tipo_evento, empleado_id, dispositivo_id, exitoso, codigo_resultado, metadata_json)
           VALUES ('JUSTIFICACION_ASISTENCIA_MOVIL', ?, ?, 1, 'PENDIENTE', ?)`,
          [employeeId, deviceId, JSON.stringify({ justification_id: result.insertId, attendance_id: attendanceId,
            incident_type: incidentType, category, has_evidence: Boolean(stored) })],
        );
        return result.insertId;
      });
      return { id, status: 'PENDIENTE', has_evidence: Boolean(stored) };
    } catch (error) {
      if (stored) await this.storage.remove(stored.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async cancel(employeeId: number, deviceId: number, justificationId: number) {
    if (!Number.isInteger(justificationId) || justificationId < 1) throw new Error('La justificacion no es valida.');
    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM personal_justificaciones_asistencia
          WHERE id = ? AND empleado_id = ? AND estado = 'PENDIENTE' LIMIT 1 FOR UPDATE`,
        [justificationId, employeeId],
      );
      if (!rows.length) throw new Error('Solo puedes cancelar una justificacion pendiente.');
      await connection.query(
        `UPDATE personal_justificaciones_asistencia SET estado = 'CANCELADA', cancelado_en = NOW() WHERE id = ?`,
        [justificationId],
      );
      await connection.query(
        `INSERT INTO personal_auditoria_eventos
          (tipo_evento, empleado_id, dispositivo_id, exitoso, codigo_resultado, metadata_json)
         VALUES ('CANCELACION_JUSTIFICACION_ASISTENCIA', ?, ?, 1, 'CANCELADA', ?)`,
        [employeeId, deviceId, JSON.stringify({ justification_id: justificationId })],
      );
    });
  }
}
