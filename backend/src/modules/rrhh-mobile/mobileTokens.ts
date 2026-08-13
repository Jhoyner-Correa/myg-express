import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';

export const MOBILE_TOKEN_AUDIENCE = 'myg-rrhh-mobile';
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

export function verifyMobileAccessToken(token: string) {
  return jwt.verify(token, jwtSecret(), {
    audience: MOBILE_TOKEN_AUDIENCE,
    issuer: MOBILE_TOKEN_ISSUER,
  }) as jwt.JwtPayload & { sub: string; device_id: number; sid: number; token_type: 'access' };
}
