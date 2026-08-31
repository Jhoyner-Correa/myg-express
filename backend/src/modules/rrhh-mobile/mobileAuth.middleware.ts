import { NextFunction, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../core/database/database';
import { verifyMobileAccessToken, verifyMobileGpsToken } from './mobileTokens';

export interface MobileAuthRequest extends Request {
  employee?: {
    id: number;
    sedeId: number;
    deviceId: number;
    sessionId: number;
    publicKey: string;
    requiresPasswordChange: boolean;
  };
}

type MobileIdentityRow = RowDataPacket & {
  empleado_id: number;
  sede_id: number;
  dispositivo_id: number;
  sesion_id: number;
  clave_publica: string;
  requiere_cambio_clave: number;
};

const VERSION_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const lastVersionSyncByDevice = new Map<number, number>();

export async function verifyMobileEmployee(req: MobileAuthRequest, res: Response, next: NextFunction) {
  try {
    const [scheme, token] = String(req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Sesion requerida.' });
    }
    const payload = verifyMobileAccessToken(token);
    if (payload.token_type !== 'access') throw new Error('Tipo de token invalido.');
    return await attachMobileIdentity(req, res, next, payload);
  } catch {
    return res.status(401).json({ ok: false, code: 'TOKEN_INVALID', message: 'Sesion invalida o expirada.' });
  }
}

/** Middleware exclusivo del servicio nativo de rastreo. */
export async function verifyMobileGpsReporter(req: MobileAuthRequest, res: Response, next: NextFunction) {
  try {
    const [scheme, token] = String(req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Credencial GPS requerida.' });
    }
    const payload = verifyMobileGpsToken(token);
    return await attachMobileIdentity(req, res, next, payload);
  } catch {
    return res.status(401).json({ ok: false, code: 'GPS_TOKEN_INVALID', message: 'El rastreo debe renovarse desde la aplicacion.' });
  }
}

async function attachMobileIdentity(
  req: MobileAuthRequest,
  res: Response,
  next: NextFunction,
  payload: { sub: string; device_id: number; sid: number },
) {
  const [rows] = await pool.query<MobileIdentityRow[]>(
      `SELECT employee.id AS empleado_id, employee.sede_id,
              device.id AS dispositivo_id, session.id AS sesion_id,
              device.clave_publica, access.requiere_cambio_clave
         FROM personal_sesiones_app session
         INNER JOIN personal_empleados employee ON employee.id = session.empleado_id
         INNER JOIN personal_dispositivos device ON device.id = session.dispositivo_id
         INNER JOIN personal_acceso_app access ON access.empleado_id = employee.id
        WHERE session.id = ? AND employee.id = ? AND device.id = ?
          AND session.revocado_en IS NULL AND session.expira_en > NOW()
          AND device.estado = 'AUTORIZADO' AND employee.estado = 'ACTIVO'
        LIMIT 1`,
      [Number(payload.sid), Number(payload.sub), Number(payload.device_id)],
    );
    if (!rows.length) {
      return res.status(401).json({ ok: false, code: 'SESSION_INVALID', message: 'La sesion ya no es valida.' });
    }

    req.employee = {
      id: Number(rows[0].empleado_id),
      sedeId: Number(rows[0].sede_id),
      deviceId: Number(rows[0].dispositivo_id),
      sessionId: Number(rows[0].sesion_id),
      publicKey: rows[0].clave_publica,
      requiresPasswordChange: Boolean(rows[0].requiere_cambio_clave),
    };
    await synchronizeDeviceVersion(req, req.employee.deviceId);
    return next();
}

async function synchronizeDeviceVersion(req: Request, deviceId: number): Promise<void> {
  const now = Date.now();
  const lastSync = lastVersionSyncByDevice.get(deviceId) ?? 0;
  if (now - lastSync < VERSION_SYNC_INTERVAL_MS) return;

  const version = String(req.header('x-app-version') ?? '').trim();
  const build = String(req.header('x-app-build') ?? '').trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || !/^\d{1,10}$/.test(build)) return;

  const appVersion = `${version}+${build}`.slice(0, 50);
  try {
    await pool.query(
      `UPDATE personal_dispositivos
          SET version_app = ?
        WHERE id = ? AND (version_app IS NULL OR version_app <> ?)`,
      [appVersion, deviceId, appVersion],
    );
    lastVersionSyncByDevice.set(deviceId, now);
  } catch (error) {
    // La telemetria de version nunca debe bloquear una operacion laboral.
    console.warn('[RRHH Mobile] No se pudo sincronizar la version del dispositivo:', error);
  }
}
