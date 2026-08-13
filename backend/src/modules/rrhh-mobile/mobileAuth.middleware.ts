import { NextFunction, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../../core/database/database';
import { verifyMobileAccessToken } from './mobileTokens';

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

export async function verifyMobileEmployee(req: MobileAuthRequest, res: Response, next: NextFunction) {
  try {
    const [scheme, token] = String(req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Sesion requerida.' });
    }
    const payload = verifyMobileAccessToken(token);
    if (payload.token_type !== 'access') throw new Error('Tipo de token invalido.');

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
    return next();
  } catch {
    return res.status(401).json({ ok: false, code: 'TOKEN_INVALID', message: 'Sesion invalida o expirada.' });
  }
}
