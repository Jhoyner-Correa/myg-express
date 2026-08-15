import type { AttendanceDashboardEmployee, Employee } from '../types';

export function summarizeAttendanceStates(items: AttendanceDashboardEmployee[]) {
  const relevant = items.filter(item => item.status !== 'NO_LABORABLE');
  return {
    total: relevant.length,
    present: relevant.filter(item => ['PRESENTE', 'TARDANZA'].includes(item.status)).length,
    absent: relevant.filter(item => ['FALTA', 'SIN_REGISTRO'].includes(item.status)).length,
    vacations: relevant.filter(item => item.status === 'VACACIONES').length,
    permissions: relevant.filter(item => item.status === 'PERMISO').length,
  };
}

export function summarizeHeadcount(employees: Employee[]) {
  const sites = new Map<string, number>();
  employees.filter(employee => employee.estado === 'ACTIVO').forEach(employee => {
    const name = employee.sedeNombre?.trim() || `Sede ${employee.sedeId}`;
    sites.set(name, (sites.get(name) ?? 0) + 1);
  });
  return [...sites.entries()]
    .map(([site, total]) => ({ site, total }))
    .sort((left, right) => right.total - left.total || left.site.localeCompare(right.site, 'es'));
}
