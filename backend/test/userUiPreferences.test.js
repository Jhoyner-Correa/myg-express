const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeVisibleModules } = require('../dist/core/auth/userUiPreferences');

test('normaliza la navegación sin convertirla en una lista de permisos', () => {
  assert.deepEqual(
    normalizeVisibleModules(['admin.panel.ver', 'rrhh.ver', 'rrhh.ver', 'rutas.gestionar', '']),
    ['admin.panel.ver', 'rrhh.ver'],
  );
});

test('una preferencia vacía no concede módulos desconocidos', () => {
  assert.deepEqual(normalizeVisibleModules(null), []);
  assert.deepEqual(normalizeVisibleModules(['permiso.inexistente']), []);
});
