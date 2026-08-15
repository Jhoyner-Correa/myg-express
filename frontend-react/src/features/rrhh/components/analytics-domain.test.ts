import { describe, expect, it } from 'vitest';
import type { AttendanceDashboardEmployee, Employee } from '../types';
import { summarizeAttendanceStates, summarizeHeadcount } from './analytics-domain';

describe('analítica ejecutiva de RR. HH.', () => {
  it('separa asistencia, ausencias y licencias sin contar días no laborables', () => {
    const statuses = ['PRESENTE', 'TARDANZA', 'SIN_REGISTRO', 'VACACIONES', 'PERMISO', 'NO_LABORABLE'] as const;
    const items = statuses.map((status, index) => ({ employee_id: index, status })) as AttendanceDashboardEmployee[];
    expect(summarizeAttendanceStates(items)).toEqual({ total: 5, present: 2, absent: 1, vacations: 1, permissions: 1 });
  });

  it('agrupa únicamente personal activo por sede', () => {
    const employees = [
      { id: 1, sedeId: 2, sedeNombre: 'Chanchamayo', estado: 'ACTIVO' },
      { id: 2, sedeId: 2, sedeNombre: 'Chanchamayo', estado: 'ACTIVO' },
      { id: 3, sedeId: 3, sedeNombre: 'Satipo', estado: 'INACTIVO' },
    ] as Employee[];
    expect(summarizeHeadcount(employees)).toEqual([{ site: 'Chanchamayo', total: 2 }]);
  });
});
