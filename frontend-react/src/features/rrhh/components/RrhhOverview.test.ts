import { describe, expect, it } from 'vitest';
import type { AttendanceDashboardEmployee } from '../types';
import { summarizeSitePerformance } from './overview-domain';

function attendanceRow(siteId: number, siteName: string, status: AttendanceDashboardEmployee['status'], overtimeMinutes = 0): AttendanceDashboardEmployee {
  return {
    employee_id: siteId * 100 + status.length + overtimeMinutes,
    site_id: siteId,
    site_name: siteName,
    employee_code: 'MYG-01',
    names: 'Colaborador',
    last_names: 'Prueba',
    job_role: 'Operador',
    attendance_id: null,
    status,
    delay_minutes: status === 'TARDANZA' ? 10 : 0,
    return_delay_minutes: 0,
    overtime_minutes: overtimeMinutes,
    operational_status: status === 'SIN_REGISTRO' ? 'PENDIENTE_ENTRADA' : status === 'VACACIONES' ? 'VACACIONES' : status === 'PERMISO' ? 'PERMISO' : status === 'FALTA' ? 'FALTA' : 'EN_JORNADA',
    next_action: status === 'SIN_REGISTRO' ? 'MARCAR_ENTRADA' : 'NINGUNA',
    requires_attention: status === 'FALTA',
    completed_marks: 0,
    expected_marks: 2,
    schedule: null,
    marks: { entry: null, lunch_out: null, lunch_return: null, exit: null },
  };
}

describe('summarizeSitePerformance', () => {
  it('consolida asistencia, tardanzas y horas extra por sede', () => {
    const result = summarizeSitePerformance([
      attendanceRow(2, 'Chanchamayo', 'PRESENTE', 30),
      attendanceRow(2, 'Chanchamayo', 'TARDANZA', 15),
      attendanceRow(2, 'Chanchamayo', 'SIN_REGISTRO'),
      attendanceRow(3, 'Satipo', 'PRESENTE'),
    ]);

    expect(result).toEqual([
      { siteId: 3, siteName: 'Satipo', employees: 1, present: 1, attendanceRate: 100, late: 0, overtimeMinutes: 0 },
      { siteId: 2, siteName: 'Chanchamayo', employees: 3, present: 2, attendanceRate: 67, late: 1, overtimeMinutes: 45 },
    ]);
  });
});
