import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { businessDate } from '../../../core/utils/time';
import { ClockType } from '../domain/Marcacion';
import { AttendanceRuleError, assertClockTransition, isClockType, validateGeofence } from '../domain/attendancePolicy';
import { AsistenciaService } from './AsistenciaService';

export const PRIVATE_SELFIE_ROOT = path.resolve(
  process.env.RRHH_PRIVATE_EVIDENCE_DIR || path.join(process.cwd(), 'private-storage', 'rrhh-evidence'),
);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FAILURE_CODES = new Set([
  'AUTHENTICATION_FAILED',
  'LOCKED_OUT',
  'LOCKED_OUT_PERMANENT',
  'NOT_AVAILABLE',
  'NOT_ENROLLED',
  'KEY_INVALIDATED',
]);

type ContingencyStatus = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';
type ContingencyRow = RowDataPacket & {
  id: number;
  request_id: string;
  empleado_id: number;
  sede_id: number;
  dispositivo_id: number;
  tipo_marcacion: ClockType;
  latitud: string;
  longitud: string;
  precision_gps: string;
  distancia_sede_metros: string;
  capturada_en: Date;
  codigo_fallo_biometrico: string;
  selfie_storage_key: string;
  selfie_sha256: string;
  selfie_mime_type: string;
  selfie_bytes_size: number;
  estado: ContingencyStatus;
  revisado_por: number | null;
  comentario_revision: string | null;
  revisado_en: Date | null;
  marcacion_id: number | null;
  expira_en: Date;
  created_at: Date;
};

export class ContingencyError extends Error {
  constructor(message: string, readonly code: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ContingencyError';
  }
}

export type CreateContingencyInput = {
  requestId: string;
  clockType: unknown;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  biometricFailureCode: string;
};

function publicRow(row: ContingencyRow & Record<string, unknown>) {
  return {
    id: Number(row.id),
    request_id: row.request_id,
    employee_id: Number(row.empleado_id),
    site_id: Number(row.sede_id),
    device_id: Number(row.dispositivo_id),
    clock_type: row.tipo_marcacion,
    latitude: Number(row.latitud),
    longitude: Number(row.longitud),
    accuracy_meters: Number(row.precision_gps),
    distance_meters: Number(row.distancia_sede_metros),
    captured_at: new Date(row.capturada_en).toISOString(),
    biometric_failure_code: row.codigo_fallo_biometrico,
    status: row.estado,
    reviewer_id: row.revisado_por === null ? null : Number(row.revisado_por),
    review_comment: row.comentario_revision,
    reviewed_at: row.revisado_en ? new Date(row.revisado_en).toISOString() : null,
    mark_id: row.marcacion_id === null ? null : Number(row.marcacion_id),
    expires_at: new Date(row.expira_en).toISOString(),
    created_at: new Date(row.created_at).toISOString(),
    employee_code: row.codigo_empleado,
    employee_names: row.nombres,
    employee_last_names: row.apellidos,
    job_role: row.cargo_nombre,
    site_name: row.sede_nombre,
  };
}

export class AttendanceContingencyService {
  constructor(private readonly attendanceService: AsistenciaService) {}

  async create(
    employee: { id: number; sedeId: number; deviceId: number },
    input: CreateContingencyInput,
    selfie: Express.Multer.File,
    ipAddress?: string | null,
  ) {
    try {
      if (!UUID_PATTERN.test(input.requestId)) throw new ContingencyError('request_id no valido.', 'INVALID_INPUT');
      if (!isClockType(input.clockType)) throw new ContingencyError('Tipo de marcacion no valido.', 'INVALID_CLOCK_TYPE');
      const failureCode = input.biometricFailureCode.trim().toUpperCase();
      if (!ALLOWED_FAILURE_CODES.has(failureCode)) {
        throw new ContingencyError('El motivo biometrico no admite contingencia con selfie.', 'FALLBACK_NOT_ALLOWED', 422);
      }
      const capturedAt = new Date(input.capturedAt);
      if (!Number.isFinite(capturedAt.getTime()) || Math.abs(Date.now() - capturedAt.getTime()) > 2 * 60 * 1000) {
        throw new ContingencyError('La hora de captura no es valida.', 'DEVICE_TIME_INVALID', 422);
      }
      await this.assertJpeg(selfie);
      const selfieBytes = await fs.readFile(selfie.path);
      const selfieSha256 = createHash('sha256').update(selfieBytes).digest('hex');

      const created = await runInTransaction(async connection => {
        const [existingRows] = await connection.query<ContingencyRow[]>(
          'SELECT * FROM personal_solicitudes_marcacion WHERE request_id = ? LIMIT 1',
          [input.requestId],
        );
        if (existingRows.length) {
          if (Number(existingRows[0].empleado_id) !== employee.id) {
            throw new ContingencyError('request_id ya fue utilizado.', 'REQUEST_ID_CONFLICT', 409);
          }
          return existingRows[0];
        }

        const [geofenceRows] = await connection.query<RowDataPacket[]>(
          `SELECT latitud, longitud, radio_permitido_metros, precision_maxima_metros
             FROM personal_configuracion_gps_sedes WHERE sede_id = ? LIMIT 1`,
          [employee.sedeId],
        );
        const geofence = geofenceRows.length ? {
          latitude: Number(geofenceRows[0].latitud),
          longitude: Number(geofenceRows[0].longitud),
          radiusMeters: Number(geofenceRows[0].radio_permitido_metros),
          maximumAccuracyMeters: Number(geofenceRows[0].precision_maxima_metros),
        } : null;
        const geofenceResult = validateGeofence(
          { latitude: input.latitude, longitude: input.longitude },
          input.accuracyMeters,
          geofence,
        );
        const date = businessDate(capturedAt);
        const [markRows] = await connection.query<RowDataPacket[]>(
          `SELECT mark.tipo_marcacion
             FROM personal_asistencias attendance
             INNER JOIN personal_marcaciones mark ON mark.asistencia_id = attendance.id
            WHERE attendance.empleado_id = ? AND attendance.fecha = ?
            ORDER BY mark.hora_marcacion, mark.id`,
          [employee.id, date],
        );
        assertClockTransition(markRows.map(row => row.tipo_marcacion as ClockType), input.clockType);
        const [pendingRows] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM personal_solicitudes_marcacion
            WHERE empleado_id = ? AND estado = 'PENDIENTE'
              AND DATE(capturada_en) = ? LIMIT 1`,
          [employee.id, date],
        );
        if (pendingRows.length) {
          throw new ContingencyError('Ya existe una marcacion pendiente de revision para hoy.', 'FALLBACK_ALREADY_PENDING', 409);
        }

        const expiresAt = new Date(capturedAt.getTime() + 60 * 24 * 60 * 60 * 1000);
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_solicitudes_marcacion (
            request_id, empleado_id, sede_id, dispositivo_id, tipo_marcacion,
            latitud, longitud, precision_gps, distancia_sede_metros, capturada_en,
            codigo_fallo_biometrico, selfie_storage_key, selfie_sha256,
            selfie_mime_type, selfie_bytes_size, expira_en
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.requestId, employee.id, employee.sedeId, employee.deviceId, input.clockType,
            input.latitude, input.longitude, input.accuracyMeters, geofenceResult.distanceMeters, capturedAt,
            failureCode, selfie.filename, selfieSha256, 'image/jpeg', selfie.size, expiresAt,
          ],
        );
        await connection.query(
          `INSERT INTO personal_auditoria_eventos (
            tipo_evento, empleado_id, dispositivo_id, exitoso, codigo_resultado, ip_address, metadata_json
          ) VALUES ('SOLICITUD_SELFIE_MARCACION', ?, ?, 1, 'PENDIENTE_REVISION', ?, ?)`,
          [employee.id, employee.deviceId, ipAddress || null, JSON.stringify({ request_id: input.requestId, tipo: input.clockType })],
        );
        const [rows] = await connection.query<ContingencyRow[]>(
          'SELECT * FROM personal_solicitudes_marcacion WHERE id = ? LIMIT 1',
          [result.insertId],
        );
        return rows[0];
      });
      if (created.selfie_storage_key !== selfie.filename) await fs.unlink(selfie.path).catch(() => undefined);
      return publicRow(created);
    } catch (error) {
      await fs.unlink(selfie.path).catch(() => undefined);
      throw error;
    }
  }

  async list(siteId: number | null, companyId: number | null, status: string = 'PENDIENTE') {
    const normalized = status.toUpperCase();
    if (!['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA', 'TODAS'].includes(normalized)) {
      throw new ContingencyError('Estado de solicitud no valido.', 'INVALID_STATUS');
    }
    const params: unknown[] = [companyId, companyId, siteId, siteId];
    const statusSql = normalized === 'TODAS' ? '' : ' AND request.estado = ?';
    if (normalized !== 'TODAS') params.push(normalized);
    const [rows] = await pool.query<(ContingencyRow & Record<string, unknown>)[]>(
      `SELECT request.*, employee.codigo_empleado, employee.nombres, employee.apellidos,
              role.nombre AS cargo_nombre, site.nombre AS sede_nombre
         FROM personal_solicitudes_marcacion request
         INNER JOIN personal_empleados employee ON employee.id = request.empleado_id
         INNER JOIN personal_cargos role ON role.id = employee.cargo_id
         INNER JOIN sedes site ON site.id = request.sede_id
        WHERE (? IS NULL OR site.empresa_id = ?)
          AND (? IS NULL OR request.sede_id = ?)${statusSql}
        ORDER BY CASE request.estado WHEN 'PENDIENTE' THEN 0 ELSE 1 END,
                 request.capturada_en DESC LIMIT 200`,
      params,
    );
    return rows.map(publicRow);
  }

  async resolve(
    siteId: number,
    requestId: number,
    reviewerId: number,
    decision: unknown,
    comment: unknown,
    ipAddress?: string | null,
  ) {
    const normalizedDecision = String(decision || '').toUpperCase();
    if (!['APROBAR', 'RECHAZAR'].includes(normalizedDecision)) {
      throw new ContingencyError('Decision no valida.', 'INVALID_DECISION');
    }
    const reviewComment = String(comment || '').trim();
    if (reviewComment.length < 3 || reviewComment.length > 500) {
      throw new ContingencyError('Registra un comentario de revision entre 3 y 500 caracteres.', 'REVIEW_COMMENT_REQUIRED');
    }
    const [rows] = await pool.query<ContingencyRow[]>(
      'SELECT * FROM personal_solicitudes_marcacion WHERE id = ? AND sede_id = ? LIMIT 1',
      [requestId, siteId],
    );
    if (!rows.length) throw new ContingencyError('Solicitud no encontrada.', 'FALLBACK_NOT_FOUND', 404);
    const request = rows[0];
    if (request.estado !== 'PENDIENTE') {
      throw new ContingencyError('La solicitud ya fue resuelta.', 'FALLBACK_ALREADY_RESOLVED', 409);
    }

    if (normalizedDecision === 'RECHAZAR') {
      const [update] = await pool.query<ResultSetHeader>(
        `UPDATE personal_solicitudes_marcacion SET estado = 'RECHAZADA', revisado_por = ?,
          comentario_revision = ?, revisado_en = NOW() WHERE id = ? AND estado = 'PENDIENTE'`,
        [reviewerId, reviewComment, requestId],
      );
      if (update.affectedRows !== 1) {
        throw new ContingencyError('La solicitud fue resuelta simultaneamente.', 'FALLBACK_ALREADY_RESOLVED', 409);
      }
      await this.auditResolution(request, reviewerId, 'RECHAZADA', reviewComment, ipAddress);
      return { id: requestId, status: 'RECHAZADA', mark_id: null };
    }

    const result = await this.attendanceService.registrarMarcacion({
      requestId: request.request_id,
      empleadoId: Number(request.empleado_id),
      dispositivoId: Number(request.dispositivo_id),
      tipo: request.tipo_marcacion,
      origen: 'BIOMETRICO',
      latitud: Number(request.latitud),
      longitud: Number(request.longitud),
      precisionGps: Number(request.precision_gps),
      selfiePath: `private://rrhh-evidence/${request.selfie_storage_key}`,
      wifi: null,
      bluetooth: null,
      verificacionIdentidad: 'SELFIE_REVISADA',
      occurredAt: new Date(request.capturada_en),
      actorUsuarioId: reviewerId,
      ipAddress,
    });
    await runInTransaction(async connection => {
      const [update] = await connection.query<ResultSetHeader>(
        `UPDATE personal_solicitudes_marcacion SET estado = 'APROBADA', revisado_por = ?,
          comentario_revision = ?, revisado_en = NOW(), marcacion_id = ?
          WHERE id = ? AND estado = 'PENDIENTE'`,
        [reviewerId, reviewComment, result.marcacion.id, requestId],
      );
      if (update.affectedRows !== 1) throw new ContingencyError('La solicitud fue resuelta simultaneamente.', 'FALLBACK_ALREADY_RESOLVED', 409);
      await connection.query(
        `INSERT INTO personal_evidencias_marcacion (
          marcacion_id, storage_key, sha256, mime_type, bytes_size, capturada_en, expira_en
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE storage_key = VALUES(storage_key), sha256 = VALUES(sha256),
          mime_type = VALUES(mime_type), bytes_size = VALUES(bytes_size), capturada_en = VALUES(capturada_en),
          expira_en = VALUES(expira_en), estado = 'ACTIVA', eliminada_en = NULL`,
        [
          result.marcacion.id, request.selfie_storage_key, request.selfie_sha256,
          request.selfie_mime_type, request.selfie_bytes_size, request.capturada_en, request.expira_en,
        ],
      );
    });
    await this.auditResolution(request, reviewerId, 'APROBADA', reviewComment, ipAddress);
    return { id: requestId, status: 'APROBADA', mark_id: result.marcacion.id };
  }

  async evidence(siteId: number, requestId: number) {
    const [rows] = await pool.query<ContingencyRow[]>(
      'SELECT * FROM personal_solicitudes_marcacion WHERE id = ? AND sede_id = ? LIMIT 1',
      [requestId, siteId],
    );
    if (!rows.length) throw new ContingencyError('Evidencia no encontrada.', 'EVIDENCE_NOT_FOUND', 404);
    const storageKey = path.basename(rows[0].selfie_storage_key);
    const absolutePath = path.resolve(PRIVATE_SELFIE_ROOT, storageKey);
    if (!absolutePath.startsWith(`${PRIVATE_SELFIE_ROOT}${path.sep}`)) {
      throw new ContingencyError('Ruta de evidencia no valida.', 'EVIDENCE_INVALID', 500);
    }
    await fs.access(absolutePath).catch(() => {
      throw new ContingencyError('El archivo de evidencia no esta disponible.', 'EVIDENCE_NOT_FOUND', 404);
    });
    return { absolutePath, mimeType: rows[0].selfie_mime_type };
  }

  private async assertJpeg(file: Express.Multer.File) {
    if (file.mimetype !== 'image/jpeg' || file.size < 10_000 || file.size > 1_500_000) {
      throw new ContingencyError('La selfie debe ser JPEG y pesar entre 10 KB y 1.5 MB.', 'INVALID_SELFIE', 422);
    }
    const handle = await fs.open(file.path, 'r');
    try {
      const header = Buffer.alloc(3);
      await handle.read(header, 0, 3, 0);
      if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
        throw new ContingencyError('El archivo no es una imagen JPEG valida.', 'INVALID_SELFIE', 422);
      }
    } finally {
      await handle.close();
    }
  }

  private async auditResolution(
    request: ContingencyRow,
    reviewerId: number,
    result: 'APROBADA' | 'RECHAZADA',
    comment: string,
    ipAddress?: string | null,
  ) {
    await pool.query(
      `INSERT INTO personal_auditoria_eventos (
        tipo_evento, empleado_id, usuario_id, dispositivo_id, exitoso,
        codigo_resultado, ip_address, metadata_json
      ) VALUES ('REVISION_SELFIE_MARCACION', ?, ?, ?, 1, ?, ?, ?)`,
      [
        request.empleado_id, reviewerId, request.dispositivo_id, result, ipAddress || null,
        JSON.stringify({ request_id: request.request_id, tipo: request.tipo_marcacion, comentario: comment }),
      ],
    );
  }
}
