const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MobileOvertimeError,
  detectedOvertimeMinutes,
} = require('../dist/modules/rrhh-mobile/mobileOvertime.service');

test('calcula sobretiempo desde una hora SQL sin producir NaN', () => {
  assert.equal(detectedOvertimeMinutes(20 * 60 + 15, '20:00:00'), 15);
  assert.equal(detectedOvertimeMinutes(13 * 60 + 20, '13:00:00'), 20);
});

test('no genera minutos negativos antes de la hora programada', () => {
  assert.equal(detectedOvertimeMinutes(19 * 60 + 55, '20:00:00'), 0);
});

test('rechaza un reloj actual inválido antes de construir una consulta SQL', () => {
  assert.throws(
    () => detectedOvertimeMinutes(Number.NaN, '20:00:00'),
    error => error instanceof MobileOvertimeError && error.code === 'INVALID_OVERTIME_CLOCK',
  );
});
