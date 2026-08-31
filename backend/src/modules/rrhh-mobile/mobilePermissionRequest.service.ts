import path from 'path';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../core/database/database';
import { businessDate } from '../../core/utils/time';
import { validateAbsenceDateTime } from '../rrhh/services/AbsenceWorkflowService';
import { PermissionEvidenceStorageService, StoredPermissionEvidence } from '../rrhh/services/PermissionEvidenceStorageService';

const PERMISSION_TYPES = new Set(['MEDICO', 'PERSONAL', 'FAMILIAR', 'OTRO']);
type MobilePermissionInput = {
  type?: unknown;
  duration_mode?: unknown;
  request_date?: unknown;
  start_at?: unknown;
  end_at?: unknown;
  reason?: unknown;
};
type EvidenceInput = { buffer: Buffer; mimetype: string; originalname: string };
type PermissionPeriod = { mode: 'FULL_DAY' | 'HOURS'; start: string; end: string };

function limaDate(value: string) { return new Date(`${value.replace(' ', 'T')}-05:00`); }

function validateRequestWindow(start: string, end: string) {
  const startDate = limaDate(start);
  const endDate = limaDate(end);
  if (endDate <= startDate) throw new Error('La fecha final debe ser posterior al inicio.');
  const now = new Date();
  if (startDate < new Date(now.getTime() - 7 * 86_400_000)) {
    throw new Error('Solo puedes registrar permisos de los ultimos 7 dias.');
  }
  if (startDate > new Date(now.getTime() + 90 * 86_400_000)) {
    throw new Error('La fecha solicitada no puede superar los proximos 90 dias.');
  }
  if (endDate.getTime() - startDate.getTime() > 15 * 86_400_000) {
    throw new Error('Un permiso no puede superar 15 dias.');
  }
}

function validateDateOnly(value: unknown) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Selecciona una fecha válida.');
  const parsed = limaDate(`${date} 12:00:00`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Selecciona una fecha válida.');
  }
  return date;
}

export function resolveMobilePermissionPeriod(input: MobilePermissionInput): PermissionPeriod {
  const mode = String(input.duration_mode || 'HOURS').trim().toUpperCase();
  if (mode === 'FULL_DAY') {
    const date = validateDateOnly(input.request_date);
    return { mode, start: `${date} 00:00:00`, end: `${date} 23:59:59` };
  }
  if (mode !== 'HOURS') throw new Error('Selecciona una duración válida.');
  const start = validateAbsenceDateTime(input.start_at, 'La fecha de inicio');
  const end = validateAbsenceDateTime(input.end_at, 'La fecha de fin');
  if (start.slice(0, 10) !== end.slice(0, 10)) {
    throw new Error('Un permiso por horas debe comenzar y terminar el mismo día.');
  }
  return { mode, start, end };
}

export class MobilePermissionRequestService {
  constructor(private readonly storage = new PermissionEvidenceStorageService()) {}

  async list(employeeId: number) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT request.id, request.tipo_permiso, request.fecha_inicio, request.fecha_fin,
              request.motivo, request.estado, request.comentario_resolucion,
              request.resuelto_en, request.motivo_cancelacion, request.cancelado_en,
              request.created_at,
              CASE WHEN attachment.id IS NULL THEN 0 ELSE 1 END AS tiene_sustento,
              attachment.nombre_original AS sustento_nombre,
              CASE
                WHEN TIME(request.fecha_inicio) = '00:00:00'
                 AND TIME(request.fecha_fin) >= '23:59:00'
                 AND DATE(request.fecha_inicio) = DATE(request.fecha_fin)
                THEN 'FULL_DAY' ELSE 'HOURS'
              END AS modalidad
         FROM personal_solicitudes_permisos request
         LEFT JOIN personal_solicitud_permiso_adjuntos attachment ON attachment.solicitud_id = request.id
        WHERE request.empleado_id = ?
        ORDER BY request.created_at DESC LIMIT 100`,
      [employeeId],
    );
    return rows;
  }

  async create(employeeId: number, deviceId: number, input: MobilePermissionInput, evidence?: EvidenceInput) {
    const type = String(input.type || '').trim().toUpperCase();
    if (!PERMISSION_TYPES.has(type)) throw new Error('Selecciona un tipo de permiso valido.');
    const period = resolveMobilePermissionPeriod(input);
    const { start, end } = period;
    validateRequestWindow(start, end);
    const reason = String(input.reason || '').trim();
    if (reason.length < 10 || reason.length > 500) throw new Error('La justificacion debe tener entre 10 y 500 caracteres.');
    if (type === 'MEDICO' && !evidence) throw new Error('Adjunta una foto del sustento medico.');

    let stored: StoredPermissionEvidence | null = null;
    try {
      if (evidence) stored = await this.storage.save(evidence.buffer, evidence.mimetype);
      const id = await runInTransaction(async connection => {
        const [employee] = await connection.query<RowDataPacket[]>(
          'SELECT id, estado FROM personal_empleados WHERE id = ? LIMIT 1 FOR UPDATE',
          [employeeId],
        );
        if (!employee.length || employee[0].estado !== 'ACTIVO') throw new Error('Tu perfil laboral no esta habilitado para registrar solicitudes.');
        const [overlap] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM personal_solicitudes_permisos WHERE empleado_id = ?
            AND estado NOT IN ('RECHAZADO','CANCELADO') AND fecha_inicio < ? AND fecha_fin > ? LIMIT 1`,
          [employeeId, end, start],
        );
        if (overlap.length) throw new Error('Ya tienes una solicitud registrada en ese horario.');
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_solicitudes_permisos
            (empleado_id, tipo_permiso, fecha_inicio, fecha_fin, motivo, origen_solicitud, estado)
           VALUES (?, ?, ?, ?, ?, 'MOVIL', 'PENDIENTE')`,
          [employeeId, type, start, end, reason],
        );
        if (stored && evidence) {
          await connection.query(
            `INSERT INTO personal_solicitud_permiso_adjuntos
              (solicitud_id, storage_key, nombre_original, mime_type, bytes, sha256)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [result.insertId, stored.storageKey,
              path.basename(evidence.originalname || `sustento.${stored.storageKey.split('.').pop()}`).slice(0, 255),
              stored.mimeType, stored.bytes, stored.sha256],
          );
        }
        await connection.query(
          `INSERT INTO personal_auditoria_eventos
            (tipo_evento, empleado_id, dispositivo_id, exitoso, codigo_resultado, metadata_json)
           VALUES ('SOLICITUD_PERMISO_MOVIL', ?, ?, 1, 'PENDIENTE', ?)`,
          [employeeId, deviceId, JSON.stringify({
            request_id: result.insertId,
            type,
            duration_mode: period.mode,
            business_date: businessDate(),
            has_evidence: Boolean(stored),
          })],
        );
        return result.insertId;
      });
      return { id, status: 'PENDIENTE', has_evidence: Boolean(stored) };
    } catch (error) {
      if (stored) await this.storage.remove(stored.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async cancel(employeeId: number, deviceId: number, requestId: number) {
    if (!Number.isInteger(requestId) || requestId < 1) throw new Error('La solicitud no es valida.');
    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        'SELECT id, estado FROM personal_solicitudes_permisos WHERE id = ? AND empleado_id = ? LIMIT 1 FOR UPDATE',
        [requestId, employeeId],
      );
      if (!rows.length) throw new Error('Solicitud no encontrada.');
      if (rows[0].estado !== 'PENDIENTE') throw new Error('Solo puedes cancelar solicitudes pendientes.');
      await connection.query(
        `UPDATE personal_solicitudes_permisos SET estado = 'CANCELADO',
          motivo_cancelacion = 'Cancelada por el colaborador desde la aplicacion', cancelado_en = NOW()
         WHERE id = ?`,
        [requestId],
      );
      await connection.query(
        `INSERT INTO personal_auditoria_eventos
          (tipo_evento, empleado_id, dispositivo_id, exitoso, codigo_resultado, metadata_json)
         VALUES ('CANCELACION_PERMISO_MOVIL', ?, ?, 1, 'CANCELADO', ?)`,
        [employeeId, deviceId, JSON.stringify({ request_id: requestId })],
      );
    });
  }
}
