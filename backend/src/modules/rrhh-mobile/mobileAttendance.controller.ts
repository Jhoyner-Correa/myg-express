import { createHash, randomBytes, randomUUID } from 'crypto';
import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../core/database/database';
import { AttendanceRuleError, isClockType } from '../rrhh/domain/attendancePolicy';
import { SignedClockPayload, verifyClockSignature } from '../rrhh/domain/mobileSignature';
import { AsistenciaService } from '../rrhh/services/AsistenciaService';
import { MobileAuthRequest } from './mobileAuth.middleware';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExistingMarkRow = RowDataPacket & {
  id: number;
  request_id: string;
  tipo_marcacion: string;
  hora_marcacion: Date;
  asistencia_id: number;
  empleado_id: number;
};

export class MobileAttendanceController {
  constructor(private attendanceService: AsistenciaService) {}

  createChallenge = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
      if (req.employee.requiresPasswordChange) {
        return res.status(403).json({
          ok: false,
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Cambia la contrasena temporal antes de marcar asistencia.',
        });
      }
      if (!isClockType(req.body.tipo)) {
        return res.status(400).json({ ok: false, code: 'INVALID_CLOCK_TYPE', message: 'Tipo de marcacion no valido.' });
      }

      const challengeId = randomUUID();
      const nonce = randomBytes(32).toString('base64url');
      await pool.query(
        `INSERT INTO personal_desafios_marcacion (
          id, empleado_id, dispositivo_id, tipo_marcacion, nonce_hash, expira_en
        ) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 90 SECOND))`,
        [
          challengeId,
          req.employee.id,
          req.employee.deviceId,
          req.body.tipo,
          createHash('sha256').update(nonce).digest('hex'),
        ],
      );
      return res.status(201).json({
        ok: true,
        data: { challenge_id: challengeId, nonce, expires_in_seconds: 90 },
      });
    } catch (error) {
      console.error('[RRHH Mobile] Error creando desafio:', error);
      return res.status(500).json({ ok: false, code: 'CHALLENGE_ERROR', message: 'No se pudo preparar la marcacion.' });
    }
  };

  register = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
      if (req.employee.requiresPasswordChange) {
        return res.status(403).json({ ok: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Debes cambiar la contrasena temporal.' });
      }

      const payload: SignedClockPayload = {
        challengeId: String(req.body.challenge_id || ''),
        nonce: String(req.body.nonce || ''),
        requestId: String(req.body.request_id || ''),
        clockType: req.body.tipo,
        latitude: Number(req.body.latitud),
        longitude: Number(req.body.longitud),
        accuracyMeters: Number(req.body.precision_gps),
        capturedAt: String(req.body.captured_at || ''),
      };
      if (!UUID_PATTERN.test(payload.challengeId) || !UUID_PATTERN.test(payload.requestId) || !isClockType(payload.clockType)) {
        return res.status(400).json({ ok: false, code: 'INVALID_INPUT', message: 'Solicitud de marcacion no valida.' });
      }

      const [existingRows] = await pool.query<ExistingMarkRow[]>(
        `SELECT mark.id, mark.request_id, mark.tipo_marcacion, mark.hora_marcacion,
                attendance.id AS asistencia_id, attendance.empleado_id
           FROM personal_marcaciones mark
           INNER JOIN personal_asistencias attendance ON attendance.id = mark.asistencia_id
          WHERE mark.request_id = ? LIMIT 1`,
        [payload.requestId],
      );
      if (existingRows.length) {
        const existing = existingRows[0];
        if (Number(existing.empleado_id) !== req.employee.id || existing.tipo_marcacion !== payload.clockType) {
          return res.status(409).json({ ok: false, code: 'REQUEST_ID_CONFLICT', message: 'request_id ya fue utilizado.' });
        }
        return res.json({ ok: true, replay: true, data: existing });
      }

      const capturedTime = Date.parse(payload.capturedAt);
      if (!Number.isFinite(capturedTime) || Math.abs(Date.now() - capturedTime) > 2 * 60 * 1000) {
        return res.status(422).json({ ok: false, code: 'DEVICE_TIME_INVALID', message: 'La hora del celular no es valida.' });
      }
      if (!verifyClockSignature(payload, String(req.body.signature || ''), req.employee.publicKey)) {
        return res.status(401).json({ ok: false, code: 'SIGNATURE_INVALID', message: 'No se pudo verificar la identidad del dispositivo.' });
      }

      const [challengeResult] = await pool.query<ResultSetHeader>(
        `UPDATE personal_desafios_marcacion
            SET usado_en = NOW()
          WHERE id = ? AND empleado_id = ? AND dispositivo_id = ? AND tipo_marcacion = ?
            AND nonce_hash = ? AND usado_en IS NULL AND expira_en > NOW()`,
        [
          payload.challengeId,
          req.employee.id,
          req.employee.deviceId,
          payload.clockType,
          createHash('sha256').update(payload.nonce).digest('hex'),
        ],
      );
      if (challengeResult.affectedRows !== 1) {
        return res.status(409).json({ ok: false, code: 'CHALLENGE_INVALID', message: 'El desafio expiro o ya fue utilizado.' });
      }

      const result = await this.attendanceService.registrarMarcacion({
        requestId: payload.requestId,
        empleadoId: req.employee.id,
        dispositivoId: req.employee.deviceId,
        tipo: payload.clockType,
        origen: 'BIOMETRICO',
        latitud: payload.latitude,
        longitud: payload.longitude,
        precisionGps: payload.accuracyMeters,
        selfiePath: null,
        wifi: req.body.wifi || null,
        bluetooth: null,
        verificacionIdentidad: 'BIOMETRIA_DISPOSITIVO',
        ipAddress: req.ip,
      });
      return res.status(result.idempotentReplay ? 200 : 201).json({
        ok: true,
        replay: result.idempotentReplay,
        data: result,
      });
    } catch (error) {
      const status = error instanceof AttendanceRuleError ? error.statusCode : 400;
      const code = error instanceof AttendanceRuleError ? error.code : 'CLOCK_ERROR';
      return res.status(status).json({
        ok: false,
        code,
        message: error instanceof Error ? error.message : 'No se pudo registrar la asistencia.',
      });
    }
  };
}
