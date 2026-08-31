import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';

export const MOBILE_TOKEN_AUDIENCE = 'myg-rrhh-mobile';
export const MOBILE_GPS_TOKEN_AUDIENCE = 'myg-rrhh-mobile-gps';
export const MOBILE_TOKEN_ISSUER = 'myg-express-api';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET no esta configurado.');
  return secret;
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function createMobileAccessToken(employeeId: number, deviceId: number, sessionId: number): string {
  return jwt.sign(
    { sub: String(employeeId), device_id: deviceId, sid: sessionId, token_type: 'access' },
    jwtSecret(),
    { audience: MOBILE_TOKEN_AUDIENCE, issuer: MOBILE_TOKEN_ISSUER, expiresIn: '15m' },
  );
}

export function gpsTrackingTokenTtlSeconds(): number {
  const configured = Number(process.env.RRHH_GPS_TOKEN_TTL_SECONDS || 64_800);
  if (!Number.isFinite(configured)) return 64_800;
  return Math.min(86_400, Math.max(900, Math.trunc(configured)));
}

/**
 * Credencial deliberadamente limitada al envío de posiciones GPS.
 * No permite consultar datos personales, marcar asistencia ni renovar sesiones.
 */
export function createMobileGpsToken(employeeId: number, deviceId: number, sessionId: number): string {
  return jwt.sign(
    {
      sub: String(employeeId),
      device_id: deviceId,
      sid: sessionId,
      token_type: 'gps',
      scope: 'gps:write',
    },
    jwtSecret(),
    {
      audience: MOBILE_GPS_TOKEN_AUDIENCE,
      issuer: MOBILE_TOKEN_ISSUER,
      expiresIn: gpsTrackingTokenTtlSeconds(),
    },
  );
}

export function createMobileEnrollmentToken(
  employeeId: number,
  activationId: number,
  installationId: string,
): string {
  return jwt.sign(
    {
      sub: String(employeeId),
      activation_id: activationId,
      installation_id: installationId,
      token_type: 'enrollment',
    },
    jwtSecret(),
    { audience: MOBILE_TOKEN_AUDIENCE, issuer: MOBILE_TOKEN_ISSUER, expiresIn: '5m' },
  );
}

export function verifyMobileAccessToken(token: string) {
  return jwt.verify(token, jwtSecret(), {
    audience: MOBILE_TOKEN_AUDIENCE,
    issuer: MOBILE_TOKEN_ISSUER,
  }) as jwt.JwtPayload & { sub: string; device_id: number; sid: number; token_type: 'access' };
}

export function verifyMobileGpsToken(token: string) {
  const payload = jwt.verify(token, jwtSecret(), {
    audience: MOBILE_GPS_TOKEN_AUDIENCE,
    issuer: MOBILE_TOKEN_ISSUER,
  }) as jwt.JwtPayload & {
    sub: string;
    device_id: number;
    sid: number;
    token_type: string;
    scope: string;
  };
  if (payload.token_type !== 'gps' || payload.scope !== 'gps:write') {
    throw new Error('Invalid GPS token.');
  }
  return payload;
}

export function verifyMobileEnrollmentToken(token: string) {
  const payload = jwt.verify(token, jwtSecret(), {
    audience: MOBILE_TOKEN_AUDIENCE,
    issuer: MOBILE_TOKEN_ISSUER,
  }) as jwt.JwtPayload & {
    sub: string;
    activation_id: number;
    installation_id: string;
    token_type: string;
  };
  if (payload.token_type !== 'enrollment') throw new Error('Invalid enrollment token.');
  return payload;
}
