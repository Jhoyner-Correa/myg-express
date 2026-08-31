const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildMobileVersionPolicy,
  normalizeMobileVersion,
  parseMobileBuild,
} = require('../dist/modules/rrhh-mobile/mobileVersionPolicy');

const release = {
  versionName: '1.4.0',
  buildNumber: 14,
  minimumSupportedBuild: 12,
  downloadUrl: 'https://app.myg-express.com/downloads/asistencia-myg.apk',
  releaseNotes: 'Mejoras de seguridad.',
  publishedAt: new Date('2026-08-31T12:00:00Z'),
};

test('exige actualizar una compilacion por debajo del minimo soportado', () => {
  const policy = buildMobileVersionPolicy({
    platform: 'ANDROID', channel: 'PRODUCTION', currentVersion: '1.0.0', currentBuild: 10, release,
  });
  assert.equal(policy.updateAvailable, true);
  assert.equal(policy.updateRequired, true);
});

test('permite continuar con una actualizacion opcional', () => {
  const policy = buildMobileVersionPolicy({
    platform: 'ANDROID', channel: 'PRODUCTION', currentVersion: '1.3.0', currentBuild: 13, release,
  });
  assert.equal(policy.updateAvailable, true);
  assert.equal(policy.updateRequired, false);
});

test('valida version semantica y numero de compilacion', () => {
  assert.equal(normalizeMobileVersion('1.2.3'), '1.2.3');
  assert.equal(parseMobileBuild('8'), 8);
  assert.throws(() => normalizeMobileVersion('version nueva'));
  assert.throws(() => parseMobileBuild(0));
});
