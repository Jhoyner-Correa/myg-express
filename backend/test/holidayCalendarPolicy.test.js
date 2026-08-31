const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHolidayDecision, normalizeNagerHolidayPayload } = require('../dist/modules/rrhh/domain/holidayCalendarPolicy');

test('normaliza y elimina feriados duplicados del proveedor', () => {
  const payload = [
    { date: '2026-07-28', localName: 'Fiestas Patrias', name: 'Independence Day', countryCode: 'PE', global: true, types: ['Public'] },
    { date: '2026-07-28', localName: 'Fiestas Patrias', name: 'Independence Day', countryCode: 'PE', global: true, types: ['Public'] },
    { date: '2026-07-28', localName: 'Otro país', name: 'Other', countryCode: 'CL', global: true },
  ];
  const result = normalizeNagerHolidayPayload(payload, 2026, 'https://example.test');
  assert.equal(result.length, 1);
  assert.equal(result[0].externalKey, 'PE:2026-07-28:fiestas-patrias');
});

test('ignora filas externas corruptas sin perder los feriados validos', () => {
  const result = normalizeNagerHolidayPayload([
    { date: 'fecha-invalida', countryCode: 'PE', localName: 'Registro roto' },
    { date: '2026-07-28', countryCode: 'PE', localName: 'Fiestas Patrias', name: 'Independence Day' },
  ], 2026, 'https://proveedor.example/feriados');

  assert.equal(result.length, 1);
  assert.equal(result[0].date, '2026-07-28');
});

test('una jornada especial requiere horario', () => {
  assert.throws(() => normalizeHolidayDecision({
    decision: 'JORNADA_ESPECIAL', scope: 'EMPRESA', siteId: null, scheduleId: null, comment: '',
  }), /horario/i);
});

test('una decisión de sede requiere una sede válida', () => {
  assert.throws(() => normalizeHolidayDecision({
    decision: 'NO_LABORABLE', scope: 'SEDE', siteId: null, scheduleId: null, comment: '',
  }), /sede/i);
});
