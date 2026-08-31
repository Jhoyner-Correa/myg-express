const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');

const {
  canonicalClockPayload,
  verifyClockSignature,
} = require('../dist/modules/rrhh/domain/mobileSignature');

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
const payload = {
  challengeId: '204e7d80-a0fb-4ec6-b673-a6fd69417879',
  nonce: 'server-generated-nonce',
  requestId: '7114896f-c013-49bc-9c08-b14ec715957f',
  clockType: 'ENTRADA',
  latitude: -12.06468755,
  longitude: -75.20486442,
  accuracyMeters: 8.25,
  capturedAt: '2026-08-13T14:30:00.000Z',
};

test('verifica una marcacion firmada por la clave privada del dispositivo', () => {
  const signature = sign('sha256', Buffer.from(canonicalClockPayload(payload)), privateKey).toString('base64');
  assert.equal(verifyClockSignature(payload, signature, publicKeyPem), true);
});

test('rechaza cambios de coordenadas despues de la firma', () => {
  const signature = sign('sha256', Buffer.from(canonicalClockPayload(payload)), privateKey).toString('base64');
  assert.equal(verifyClockSignature({ ...payload, latitude: -11 }, signature, publicKeyPem), false);
});
