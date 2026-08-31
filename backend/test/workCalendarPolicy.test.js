const test = require('node:test');
const assert = require('node:assert/strict');
const {
  chooseCalendarEvent,
  normalizeWorkCalendarInput,
} = require('../dist/modules/rrhh/domain/workCalendarPolicy');

test('normaliza un feriado corporativo sin horario', () => {
  const event = normalizeWorkCalendarInput({
    scope: 'EMPRESA', siteId: null, name: 'Fiestas Patrias', type: 'FERIADO',
    startDate: '2026-07-28', endDate: '2026-07-29', scheduleId: null, description: '',
  });
  assert.equal(event.siteId, null);
  assert.equal(event.scheduleId, null);
  assert.equal(event.type, 'FERIADO');
});
test('exige sede y horario para una jornada especial local', () => {
  assert.throws(() => normalizeWorkCalendarInput({
    scope: 'SEDE', siteId: null, name: 'Horario de inventario', type: 'JORNADA_ESPECIAL',
    startDate: '2026-09-01', endDate: '2026-09-01', scheduleId: null, description: '',
  }), /sede valida/);
});

test('la excepcion de sede tiene prioridad sobre el calendario corporativo', () => {
  const company = { id: 1, scope: 'EMPRESA', siteId: null };
  const site = { id: 2, scope: 'SEDE', siteId: 4 };
  assert.equal(chooseCalendarEvent([company, site], 4).id, 2);
  assert.equal(chooseCalendarEvent([company, site], 9).id, 1);
});
