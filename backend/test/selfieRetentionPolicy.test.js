const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SELFIE_RETENTION_DAYS,
  pendingSelfieExpiresAt,
  rejectedSelfieExpiresAt,
} = require('../dist/modules/rrhh/domain/selfieRetentionPolicy');

test('conserva selfies pendientes durante siete dias exactos', () => {
  const capturedAt = new Date('2026-08-19T15:00:00.000Z');
  assert.equal(SELFIE_RETENTION_DAYS.pending, 7);
  assert.equal(pendingSelfieExpiresAt(capturedAt).toISOString(), '2026-08-26T15:00:00.000Z');
});

test('conserva selfies rechazadas siete dias desde la decision', () => {
  const reviewedAt = new Date('2026-08-20T01:30:00.000Z');
  assert.equal(SELFIE_RETENTION_DAYS.rejected, 7);
  assert.equal(rejectedSelfieExpiresAt(reviewedAt).toISOString(), '2026-08-27T01:30:00.000Z');
});

test('rechaza fechas invalidas para evitar vencimientos corruptos', () => {
  assert.throws(() => pendingSelfieExpiresAt(new Date('invalid')), /Fecha de evidencia no valida/);
});
