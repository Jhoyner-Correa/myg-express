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

export function formatDurationMinutes(value: number) {
  const totalMinutes = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) return `${minutes} min`;
  if (!minutes) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** Formats administrative durations as natural Spanish instead of raw minutes. */
export function formatDurationReadable(value: number) {
  const totalMinutes = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];

  if (days) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
  if (minutes || !parts.length) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);

  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
}

/** Formats a canonical SQL TIME value for the operational UI. */
export function formatScheduleTime(value: string | null | undefined) {
  if (!value) return '—';

  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return value;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return value;

  const displayHour = hour % 12 || 12;
  const period = hour < 12 ? 'a. m.' : 'p. m.';
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

export function formatScheduleRange(start: string | null | undefined, end: string | null | undefined) {
  return `${formatScheduleTime(start)} – ${formatScheduleTime(end)}`;
}
