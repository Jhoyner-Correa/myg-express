const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSchedulePolicy,
  normalizeWeeklyAssignments,
  previousDate,
  weeklyScopePriority,
} = require('../dist/modules/rrhh/domain/schedulePolicy');

test('normaliza una jornada con ventana de almuerzo', () => {
  const policy = normalizeSchedulePolicy({
    name: 'Oficina Satipo', startTime: '08:00', endTime: '18:00', toleranceMinutes: 10,
    lunchEnabled: true, lunchStartFrom: '13:00', lunchStartUntil: '13:30',
    lunchDurationMinutes: 60, returnToleranceMinutes: 5, effectiveFrom: '2026-09-01',
  });
  assert.equal(policy.startTime, '08:00:00');
  assert.equal(policy.lunchDurationMinutes, 60);
  assert.equal(policy.effectiveFrom, '2026-09-01');
});

test('rechaza un almuerzo que termina fuera de la jornada', () => {
  assert.throws(() => normalizeSchedulePolicy({
    name: 'Horario inválido', startTime: '08:00', endTime: '14:00', toleranceMinutes: 0,
    lunchEnabled: true, lunchStartFrom: '13:30', lunchStartUntil: '13:45',
    lunchDurationMinutes: 60, returnToleranceMinutes: 0, effectiveFrom: '2026-09-01',
  }), /dentro de la jornada/);
});

test('calcula el día anterior sin depender de la zona horaria del servidor', () => {
  assert.equal(previousDate('2026-09-01'), '2026-08-31');
});

test('normaliza una semana laboral y rechaza días repetidos', () => {
  assert.deepEqual(normalizeWeeklyAssignments([
    { weekday: 6, scheduleId: 2 },
    { weekday: 1, scheduleId: 1 },
  ]), [
    { weekday: 1, scheduleId: 1 },
    { weekday: 6, scheduleId: 2 },
  ]);
  assert.throws(() => normalizeWeeklyAssignments([
    { weekday: 1, scheduleId: 1 },
    { weekday: 1, scheduleId: 2 },
  ]), /dos horarios/i);
});

test('la prioridad semanal es empleado, sede y empresa', () => {
  assert.ok(weeklyScopePriority('EMPLEADO') > weeklyScopePriority('SEDE'));
  assert.ok(weeklyScopePriority('SEDE') > weeklyScopePriority('EMPRESA'));
});
