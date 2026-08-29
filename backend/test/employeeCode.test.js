const test = require('node:test');
const assert = require('node:assert/strict');
const { employeeCodePrefix, formatEmployeeCode } = require('../dist/modules/rrhh/domain/employeeCode');

test('usa el prefijo corporativo de MyG Express', () => {
  assert.equal(employeeCodePrefix('MYG_EXPRESS', 1), 'MYG');
});

test('genera un codigo legible con correlativo estable', () => {
  assert.equal(formatEmployeeCode('myg', 44), 'MYG-0044');
  assert.equal(formatEmployeeCode('MYG', 10_000), 'MYG-10000');
});

test('genera un prefijo aislado para otras empresas', () => {
  assert.equal(employeeCodePrefix('OTRA_EMPRESA', 7), 'EMP7');
});

test('rechaza correlativos invalidos', () => {
  assert.throws(() => formatEmployeeCode('MYG', 0), /correlativo/);
});
