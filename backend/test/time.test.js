const test = require('node:test');
const assert = require('node:assert/strict');

const {
  APP_TIME_ZONE,
  businessClockMinutes,
  businessDate,
  businessDateTime,
  businessIsoWeekday,
  parseClockMinutes
} = require('../dist/core/utils/time');

test('zona empresarial predeterminada es America/Lima', () => {
  assert.equal(APP_TIME_ZONE, 'America/Lima');
});

test('antes de medianoche en Lima no cambia al dia UTC siguiente', () => {
  const instant = new Date('2026-08-12T00:30:00.000Z');
  assert.equal(businessDate(instant), '2026-08-11');
  assert.equal(businessDateTime(instant), '2026-08-11 19:30:00');
});

test('medianoche de Lima inicia el nuevo dia empresarial', () => {
  const instant = new Date('2026-08-12T05:00:00.000Z');
  assert.equal(businessDate(instant), '2026-08-12');
  assert.equal(businessClockMinutes(instant), 0);
});

test('dia de semana se calcula en Lima y no en UTC', () => {
  const sundayInLima = new Date('2026-08-10T02:00:00.000Z');
  assert.equal(businessDate(sundayInLima), '2026-08-09');
  assert.equal(businessIsoWeekday(sundayInLima), 7);
});

test('horarios SQL se convierten a minutos comparables', () => {
  assert.equal(parseClockMinutes('08:15:00'), 495);
  assert.throws(() => parseClockMinutes('hora-invalida'));
});
