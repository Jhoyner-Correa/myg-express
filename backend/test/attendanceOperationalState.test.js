const test = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveAttendanceOperationalState,
} = require('../dist/modules/rrhh/domain/attendanceOperationalState');

const schedule = {
  start_time: '09:00:00',
  end_time: '20:00:00',
  tolerance_minutes: 10,
  lunch_enabled: true,
  lunch_start_from: '13:00:00',
  lunch_duration_minutes: 120,
  return_tolerance_minutes: 5,
};

const emptyMarks = { entry: null, lunch_out: null, lunch_return: null, exit: null };

test('mantiene pendiente la entrada dentro de la tolerancia y alerta despues', () => {
  const pending = deriveAttendanceOperationalState({
    date: '2026-08-21', today: '2026-08-21', current_minutes: 550,
    status: 'SIN_REGISTRO', schedule, marks: emptyMarks,
  });
  assert.equal(pending.operational_status, 'PENDIENTE_ENTRADA');
  assert.equal(pending.requires_attention, false);

  const delayed = deriveAttendanceOperationalState({
    date: '2026-08-21', today: '2026-08-21', current_minutes: 551,
    status: 'SIN_REGISTRO', schedule, marks: emptyMarks,
  });
  assert.equal(delayed.operational_status, 'ENTRADA_RETRASADA');
  assert.equal(delayed.next_action, 'MARCAR_ENTRADA');
  assert.equal(delayed.requires_attention, true);
});

test('distingue almuerzo normal de regreso retrasado', () => {
  const marks = { ...emptyMarks, entry: new Date(), lunch_out: new Date() };
  const lunch = deriveAttendanceOperationalState({
    date: '2026-08-21', today: '2026-08-21', current_minutes: 890,
    status: 'PRESENTE', schedule, marks,
  });
  assert.equal(lunch.operational_status, 'EN_ALMUERZO');

  const delayed = deriveAttendanceOperationalState({
    date: '2026-08-21', today: '2026-08-21', current_minutes: 906,
    status: 'PRESENTE', schedule, marks,
  });
  assert.equal(delayed.operational_status, 'REGRESO_RETRASADO');
  assert.equal(delayed.requires_attention, true);
});

test('marca jornada completada e incompleta sin alterar el estado canonico', () => {
  const complete = deriveAttendanceOperationalState({
    date: '2026-08-20', today: '2026-08-21', current_minutes: 600,
    status: 'TARDANZA', schedule,
    marks: { entry: new Date(), lunch_out: new Date(), lunch_return: new Date(), exit: new Date() },
  });
  assert.equal(complete.operational_status, 'JORNADA_COMPLETADA');
  assert.equal(complete.completed_marks, 4);

  const incomplete = deriveAttendanceOperationalState({
    date: '2026-08-20', today: '2026-08-21', current_minutes: 600,
    status: 'PRESENTE', schedule,
    marks: { ...emptyMarks, entry: new Date() },
  });
  assert.equal(incomplete.operational_status, 'JORNADA_INCOMPLETA');
  assert.equal(incomplete.next_action, 'REVISAR_INCIDENCIA');
});

test('respeta permisos, vacaciones, faltas y dias no laborables', () => {
  for (const status of ['PERMISO', 'VACACIONES', 'FALTA', 'NO_LABORABLE']) {
    const result = deriveAttendanceOperationalState({
      date: '2026-08-20', today: '2026-08-21', current_minutes: 600,
      status, schedule, marks: emptyMarks,
    });
    assert.equal(result.operational_status, status);
  }
});
