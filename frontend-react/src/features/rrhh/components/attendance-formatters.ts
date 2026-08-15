import type { AttendanceDashboardEmployee } from '../types';

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceDashboardEmployee['status'], string> = {
  PRESENTE: 'Presente',
  TARDANZA: 'Tardanza',
  FALTA: 'Falta',
  PERMISO: 'Permiso',
  VACACIONES: 'Vacaciones',
  SIN_REGISTRO: 'Sin registrar',
  NO_LABORABLE: 'No laborable',
};

export function formatAttendanceClock(value: string | null) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
