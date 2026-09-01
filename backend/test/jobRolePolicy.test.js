const test = require('node:test');
const assert = require('node:assert/strict');
const { publicJobRoleDescription } = require('../dist/modules/rrhh/domain/jobRolePolicy');

test('oculta marcadores internos de datos demo en descripciones públicas', () => {
  assert.equal(
    publicJobRoleDescription('[SEED_RRHH_DEMO] Personal de distribución y reparto.'),
    'Personal de distribución y reparto.',
  );
});

test('conserva descripciones administrativas y normaliza valores vacíos', () => {
  assert.equal(publicJobRoleDescription('  Coordina las operaciones.  '), 'Coordina las operaciones.');
  assert.equal(publicJobRoleDescription(''), null);
  assert.equal(publicJobRoleDescription(null), null);
});
