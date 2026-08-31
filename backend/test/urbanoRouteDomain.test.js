const test = require('node:test');
const assert = require('node:assert/strict');

const { parseUrbanoRouteId, publicUrbanoErrorMessage } = require('../dist/modules/logistica/domain/urbanoRouteDomain');

test('acepta Ãºnicamente identificadores numÃ©ricos de ruta Urbano', () => {
  assert.equal(parseUrbanoRouteId(' 001234 '), '001234');
  assert.equal(parseUrbanoRouteId('12abc'), null);
  assert.equal(parseUrbanoRouteId('1'.repeat(21)), null);
  assert.equal(parseUrbanoRouteId({}), null);
});

test('expone errores operativos conocidos y oculta detalles internos', () => {
  assert.equal(publicUrbanoErrorMessage(new Error('Esta sede no tiene credenciales Urbano activas. Configuralas desde el panel SysAdmin.')), 'Esta sede no tiene credenciales Urbano activas. Configuralas desde el panel SysAdmin.');
  assert.equal(publicUrbanoErrorMessage(new Error('ECONNRESET secret-host:3306')), 'No se pudo consultar la ruta en Urbano.');
  assert.equal(publicUrbanoErrorMessage('error'), 'No se pudo consultar la ruta en Urbano.');
});
