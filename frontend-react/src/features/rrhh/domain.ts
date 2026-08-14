import type { EmployeeInput, ScheduleAssignment } from './types';

export const WEEKDAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
] as const;

export function validateEmployeeInput(input: EmployeeInput): string | null {
  if (!/^[A-Za-z0-9-]{3,30}$/.test(input.codigo_empleado.trim())) return 'El código debe tener entre 3 y 30 caracteres, sin espacios.';
  if (!/^\d{8,12}$/.test(input.dni.trim())) return 'El documento debe contener entre 8 y 12 dígitos.';
  if (input.nombres.trim().length < 2 || input.apellidos.trim().length < 2) return 'Completa los nombres y apellidos.';
  if (!Number.isInteger(input.cargo_id) || input.cargo_id < 1) return 'Selecciona un cargo.';
  if (!input.fecha_ingreso) return 'Selecciona la fecha de ingreso.';
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return 'El correo no tiene un formato válido.';
  if (input.telefono && !/^\+?\d{7,15}$/.test(input.telefono)) return 'El teléfono debe contener entre 7 y 15 dígitos.';
  return null;
}

export function buildWeeklyAssignments(scheduleId: number, weekdays: number[]): ScheduleAssignment[] {
  const uniqueDays = [...new Set(weekdays)].filter(day => Number.isInteger(day) && day >= 1 && day <= 7);
  if (!Number.isInteger(scheduleId) || scheduleId < 1) return [];
  return uniqueDays.sort((left, right) => left - right).map(weekday => ({ weekday, schedule_id: scheduleId }));
}
