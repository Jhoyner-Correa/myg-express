const test = require('node:test');
const assert = require('node:assert/strict');

const {
  makeDeliveryClientKey,
  normalizeDeliveryDigits,
  normalizeDeliveryText,
  parseDeliveryClientKey,
  parseDeliveryLimit
} = require('../dist/modules/logistica/domain/deliveryDomain');

test('normaliza filtros de entregas sin aceptar objetos como texto', () => {
  assert.equal(normalizeDeliveryText(['  Villa Rica  ', 'ignorado']), 'Villa Rica');
  assert.equal(normalizeDeliveryText({ q: 'oculto' }), '');
  assert.equal(normalizeDeliveryDigits('+51 987-654-321'), '51987654321');
});

test('limita de forma segura la cantidad de resultados', () => {
  assert.equal(parseDeliveryLimit(undefined, 30, 60), 30);
  assert.equal(parseDeliveryLimit('invalid', 30, 60), 30);
  assert.equal(parseDeliveryLimit('-5', 30, 60), 1);
  assert.equal(parseDeliveryLimit('999', 30, 60), 60);
  assert.equal(parseDeliveryLimit('12.9', 30, 60), 12);
});

test('genera y recupera una identidad opaca de cliente', () => {
  const key = makeDeliveryClientKey('  MARÍA PÉREZ ', ' 987654321 ');
  assert.deepEqual(parseDeliveryClientKey(key), { n: 'maría pérez', t: '987654321' });
});

test('rechaza identidades de cliente inválidas o vacías', () => {
  assert.equal(parseDeliveryClientKey('no-es-json'), null);
  assert.equal(parseDeliveryClientKey(makeDeliveryClientKey('', '')), null);
  assert.equal(parseDeliveryClientKey('x'.repeat(2049)), null);
});
