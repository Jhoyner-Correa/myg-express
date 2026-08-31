const test = require('node:test');
const assert = require('node:assert/strict');

const { attendanceReportRange } = require('../dist/modules/rrhh/services/AttendanceManagementService');

test('el reporte mensual usa el mes calendario completo', () => {
  assert.deepEqual(attendanceReportRange('MONTH', '2026-02-18'), {
    mode: 'MONTH',
    anchor: '2026-02-18',
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  });
});

test('el reporte semanal inicia el lunes y termina el domingo', () => {
  assert.deepEqual(attendanceReportRange('WEEK', '2026-08-28'), {
    mode: 'WEEK',
    anchor: '2026-08-28',
    startDate: '2026-08-24',
    endDate: '2026-08-30',
  });
});

test('rechaza una vista histórica desconocida', () => {
  assert.throws(() => attendanceReportRange('YEAR', '2026-08-28'), /Vista del historial/);
});
