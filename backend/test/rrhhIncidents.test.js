const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canCancelPermission,
  canCancelVacation,
  validateAbsenceDate,
  validateAbsenceDateTime,
} = require('../dist/modules/rrhh/services/AbsenceWorkflowService');
const { assertAdministrativeMarks } = require('../dist/modules/rrhh/services/AttendanceCorrectionService');

test('valida fechas reales y conserva el formato de MariaDB', () => {
  assert.equal(validateAbsenceDate('2026-08-13', 'Fecha'), '2026-08-13');
  assert.equal(validateAbsenceDateTime('2026-08-13T09:30', 'Fecha'), '2026-08-13 09:30:00');
  assert.throws(() => validateAbsenceDate('2026-02-30', 'Fecha'), /no es válida/);
  assert.throws(() => validateAbsenceDateTime('2026-08-13T25:00', 'Fecha'), /no es válida/);
});

test('rechaza correcciones con marcaciones incompletas o desordenadas', () => {
  const row = (tipo, hora) => ({ tipo_marcacion: tipo, hora_marcacion: new Date(`2026-08-13T${hora}:00-05:00`) });
  assert.doesNotThrow(() => assertAdministrativeMarks([row('ENTRADA', '09:00'), row('SALIDA', '18:00')]));
  assert.throws(() => assertAdministrativeMarks([row('SALIDA', '18:00')]), /hora de entrada/);
  assert.throws(() => assertAdministrativeMarks([row('ENTRADA', '09:00'), row('SALIDA_ALMUERZO', '13:00'), row('SALIDA', '18:00')]), /regreso/);
  assert.throws(() => assertAdministrativeMarks([row('ENTRADA', '09:00'), row('SALIDA', '08:00')]), /orden cronológico/);
});

test('solo permite cancelar permisos pendientes o aprobados futuros', () => {
  assert.equal(canCancelPermission('PENDIENTE', false), true);
  assert.equal(canCancelPermission('APROBADO', true), true);
  assert.equal(canCancelPermission('APROBADO', false), false);
  assert.equal(canCancelPermission('RECHAZADO', true), false);
  assert.equal(canCancelPermission('CANCELADO', true), false);
});

test('protege vacaciones iniciadas y permite retirar solicitudes futuras', () => {
  assert.equal(canCancelVacation('SOLICITADA', false), true);
  assert.equal(canCancelVacation('APROBADA', true), true);
  assert.equal(canCancelVacation('PROGRAMADA', true), true);
  assert.equal(canCancelVacation('EN_CURSO', true), false);
  assert.equal(canCancelVacation('COMPLETADA', true), false);
  assert.equal(canCancelVacation('CANCELADA', true), false);
});
