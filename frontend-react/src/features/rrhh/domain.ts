import type { EmployeeInput, ScheduleAssignment, WorkCalendarInput } from './types';

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
  if (!Number.isInteger(input.sede_id) || input.sede_id < 1) return 'Selecciona una sede.';
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

export function validateWorkCalendarInput(input: WorkCalendarInput): string | null {
  if (input.name.trim().length < 3 || input.name.trim().length > 120) return 'Escribe un nombre claro para el evento.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end_date)) return 'Selecciona un periodo válido.';
  if (input.end_date < input.start_date) return 'La fecha final no puede ser anterior a la inicial.';
  if (input.scope === 'SEDE' && (!Number.isInteger(input.site_id) || Number(input.site_id) < 1)) return 'Selecciona la sede donde aplica.';
  if (input.type === 'JORNADA_ESPECIAL' && (!Number.isInteger(input.schedule_id) || Number(input.schedule_id) < 1)) return 'Selecciona el horario especial.';
  return null;
}
