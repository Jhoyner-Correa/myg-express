const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeAttendance } = require('../dist/modules/rrhh/services/AttendanceDashboardService');

test('resume presentes, tardanzas, pendientes y jornadas cerradas', () => {
  const mark = (exit) => ({ entry: new Date(), lunch_out: null, lunch_return: null, exit });
  const items = [
    { attendance_id: 1, status: 'PRESENTE', overtime_minutes: 0, justification: null, marks: mark(new Date()) },
    { attendance_id: 2, status: 'TARDANZA', overtime_minutes: 25, justification: { status: 'APROBADA' }, marks: mark(null) },
    { attendance_id: null, status: 'SIN_REGISTRO', overtime_minutes: 0, justification: null, marks: { entry: null, lunch_out: null, lunch_return: null, exit: null } },
  ];
  assert.deepEqual(summarizeAttendance(items), {
    total_employees: 3, present: 2, on_time: 1, late: 1, without_record: 1,
    authorized_absence: 0, non_working: 0, completed: 1, overtime_minutes: 25,
    justified_incidents: 1, pending_justifications: 0, rejected_justifications: 0,
  });
});
