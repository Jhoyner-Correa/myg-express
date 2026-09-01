const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SYSTEM_PASSWORD_MAX_BYTES,
  SYSTEM_PASSWORD_MIN_LENGTH,
  validateSystemPassword,
} = require('../dist/core/security/passwordPolicy');

test('la política administrativa acepta una contraseña numérica de cuatro caracteres', () => {
  assert.equal(SYSTEM_PASSWORD_MIN_LENGTH, 4);
  assert.equal(validateSystemPassword('1234'), '1234');
});

test('la política administrativa rechaza contraseñas menores al mínimo', () => {
  assert.throws(() => validateSystemPassword('123'), /entre 4 y 72 caracteres/);
});

test('la política administrativa protege el límite de 72 bytes de bcrypt', () => {
  assert.equal(SYSTEM_PASSWORD_MAX_BYTES, 72);
  assert.throws(() => validateSystemPassword('a'.repeat(73)), /entre 4 y 72 caracteres/);
});
