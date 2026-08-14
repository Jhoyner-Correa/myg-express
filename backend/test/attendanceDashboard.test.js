const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateOvertimeMinutes, summarizeAttendance } = require('../dist/modules/rrhh/services/AttendanceDashboardService');

test('calcula únicamente los minutos posteriores al fin de jornada', () => {
  assert.equal(calculateOvertimeMinutes(new Date('2026-08-13T18:35:00-05:00'), '18:00:00'), 35);
  assert.equal(calculateOvertimeMinutes(new Date('2026-08-13T17:50:00-05:00'), '18:00:00'), 0);
  assert.equal(calculateOvertimeMinutes(null, '18:00:00'), 0);
});

test('resume presentes, tardanzas, pendientes y jornadas cerradas', () => {
  const mark = (exit) => ({ entry: new Date(), lunch_out: null, lunch_return: null, exit });
  const items = [
    { attendance_id: 1, status: 'PRESENTE', overtime_minutes: 0, marks: mark(new Date()) },
    { attendance_id: 2, status: 'TARDANZA', overtime_minutes: 25, marks: mark(null) },
    { attendance_id: null, status: 'SIN_REGISTRO', overtime_minutes: 0, marks: { entry: null, lunch_out: null, lunch_return: null, exit: null } },
  ];
  assert.deepEqual(summarizeAttendance(items), {
    total_employees: 3, present: 2, on_time: 1, late: 1, without_record: 1,
    authorized_absence: 0, non_working: 0, completed: 1, overtime_minutes: 25,
  });
});
