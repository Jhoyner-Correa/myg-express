import { createPublicKey, verify } from 'crypto';
import { ClockType } from './Marcacion';

export interface SignedClockPayload {
  challengeId: string;
  nonce: string;
  requestId: string;
  clockType: ClockType;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
}

export function canonicalClockPayload(payload: SignedClockPayload): string {
  return [
    'myg-rrhh-clock-v1',
    payload.challengeId,
    payload.nonce,
    payload.requestId,
    payload.clockType,
    payload.latitude.toFixed(8),
    payload.longitude.toFixed(8),
    payload.accuracyMeters.toFixed(2),
    payload.capturedAt,
  ].join('\n');
}

export function assertSupportedDevicePublicKey(publicKeyPem: string) {
  const publicKey = createPublicKey(publicKeyPem);
  if (publicKey.asymmetricKeyType !== 'ec') {
    throw new Error('El dispositivo debe usar una clave ECDSA P-256.');
  }
  const details = publicKey.asymmetricKeyDetails;
  if (details?.namedCurve && details.namedCurve !== 'prime256v1') {
    throw new Error('La curva criptografica del dispositivo no es compatible.');
  }
}

export function verifyClockSignature(
  payload: SignedClockPayload,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  try {
    assertSupportedDevicePublicKey(publicKeyPem);
    const signature = Buffer.from(signatureBase64, 'base64');
    if (!signature.length || signature.length > 256) return false;
    return verify('sha256', Buffer.from(canonicalClockPayload(payload), 'utf8'), publicKeyPem, signature);
  } catch {
    return false;
  }
}
