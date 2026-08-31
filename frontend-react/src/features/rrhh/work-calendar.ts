export type CalendarDay = { date: string; day: number; inMonth: boolean; isToday: boolean };

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseMonthKey(value: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new Error('El mes debe tener el formato AAAA-MM.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    throw new Error('El mes indicado no es vÃ¡lido.');
  }
  return { year, month };
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(value: string, offset: number): string {
  const { year, month } = parseMonthKey(value);
  return monthKey(new Date(year, month - 1 + offset, 1));
}

export function monthBounds(value: string): { from: string; until: string } {
  const { year, month } = parseMonthKey(value);
  return {
    from: dateKey(new Date(Date.UTC(year, month - 1, 1))),
    until: dateKey(new Date(Date.UTC(year, month, 0))),
  };
}

export function buildMonthGrid(value: string, today = new Date()): CalendarDay[] {
  const { year, month } = parseMonthKey(value);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - mondayOffset);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return { date: dateKey(date), day: date.getUTCDate(), inMonth: date.getUTCMonth() === month - 1, isToday: dateKey(date) === todayKey };
  });
}
