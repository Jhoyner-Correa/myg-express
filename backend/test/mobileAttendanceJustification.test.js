const test = require('node:test');
const assert = require('node:assert/strict');
const {
  attendanceIncidentType,
  isWithinJustificationWindow,
} = require('../dist/modules/rrhh-mobile/mobileAttendanceJustification.service');

test('solo habilita justificaciones para una tardanza o inasistencia real', () => {
  assert.equal(attendanceIncidentType('TARDANZA', 18), 'TARDANZA');
  assert.equal(attendanceIncidentType('FALTA', 0), 'INASISTENCIA');
  assert.equal(attendanceIncidentType('PRESENTE', 0), null);
  assert.equal(attendanceIncidentType('TARDANZA', 0), null);
});

test('la ventana de justificación comprende el día del incidente y siete días posteriores', () => {
  assert.equal(isWithinJustificationWindow('2026-08-19', '2026-08-26'), true);
  assert.equal(isWithinJustificationWindow('2026-08-18', '2026-08-26'), false);
  assert.equal(isWithinJustificationWindow('2026-08-27', '2026-08-26'), false);
  assert.equal(isWithinJustificationWindow('fecha-invalida', '2026-08-26'), false);
});
