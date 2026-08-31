export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Lima';
export const DB_TIMEZONE = process.env.DB_TIMEZONE || '-05:00';

function partsAt(date: Date, timeZone = APP_TIME_ZONE): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  return Object.fromEntries(parts
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
}

export function businessDate(date = new Date()): string {
  const { year, month, day } = partsAt(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function businessDateTime(date = new Date()): string {
  const { year, month, day, hour, minute, second } = partsAt(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

export function businessClockMinutes(date = new Date()): number {
  const { hour, minute } = partsAt(date);
  return (hour * 60) + minute;
}

export function businessIsoWeekday(date = new Date()): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short'
  }).format(date);
  const weekdays: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7
  };
  return weekdays[label];
}

export function parseClockMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value).trim());
  if (!match) throw new Error('Hora de horario invalida');
  return (Number(match[1]) * 60) + Number(match[2]);
}

export function assertDateOnly(value: unknown): string {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Fecha invalida; usa YYYY-MM-DD');
  return date;
}
