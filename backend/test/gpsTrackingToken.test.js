const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'gps-token-test-secret-with-sufficient-entropy';

const {
  createMobileAccessToken,
  createMobileGpsToken,
  verifyMobileAccessToken,
  verifyMobileGpsToken,
} = require('../dist/modules/rrhh-mobile/mobileTokens');

test('la credencial GPS solo contiene el alcance gps:write', () => {
  const token = createMobileGpsToken(7, 11, 13);
  const payload = verifyMobileGpsToken(token);
  assert.equal(payload.sub, '7');
  assert.equal(payload.device_id, 11);
  assert.equal(payload.sid, 13);
  assert.equal(payload.token_type, 'gps');
  assert.equal(payload.scope, 'gps:write');
});

test('las credenciales GPS y de sesion no son intercambiables', () => {
  const gpsToken = createMobileGpsToken(7, 11, 13);
  const accessToken = createMobileAccessToken(7, 11, 13);
  assert.throws(() => verifyMobileAccessToken(gpsToken));
  assert.throws(() => verifyMobileGpsToken(accessToken));
});
