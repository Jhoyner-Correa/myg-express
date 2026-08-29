type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

export type EmploymentTenure = {
  years: number;
  months: number;
  days: number;
};

const DAY_IN_MS = 86_400_000;

function parseDateOnly(value: string | null | undefined): CalendarDate | null {
  const match = value?.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() + 1 !== month
    || candidate.getUTCDate() !== day
  ) return null;

  return { year, month, day };
}

function compareDates(left: CalendarDate, right: CalendarDate) {
  return Date.UTC(left.year, left.month - 1, left.day)
    - Date.UTC(right.year, right.month - 1, right.day);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsClamped(date: CalendarDate, months: number): CalendarDate {
  const absoluteMonth = date.year * 12 + date.month - 1 + months;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

function addYearsClamped(date: CalendarDate, years: number): CalendarDate {
  const year = date.year + years;
  return { year, month: date.month, day: Math.min(date.day, daysInMonth(year, date.month)) };
}

function differenceInDays(start: CalendarDate, end: CalendarDate) {
  const startUtc = Date.UTC(start.year, start.month - 1, start.day);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endUtc - startUtc) / DAY_IN_MS);
}

export function dateInPeru(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function calculateEmploymentTenure(
  admissionDate: string | null | undefined,
  endDate: string | null | undefined,
): EmploymentTenure | null {
  const start = parseDateOnly(admissionDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || compareDates(start, end) > 0) return null;

  let years = end.year - start.year;
  let yearAnchor = addYearsClamped(start, years);
  if (compareDates(yearAnchor, end) > 0) {
    years -= 1;
    yearAnchor = addYearsClamped(start, years);
  }

  let months = (end.year - yearAnchor.year) * 12 + end.month - yearAnchor.month;
  let monthAnchor = addMonthsClamped(yearAnchor, months);
  if (compareDates(monthAnchor, end) > 0) {
    months -= 1;
    monthAnchor = addMonthsClamped(yearAnchor, months);
  }

  return { years, months, days: differenceInDays(monthAnchor, end) };
}

export function formatEmploymentTenure(tenure: EmploymentTenure | null) {
  if (!tenure) return '—';

  const units = [
    tenure.years ? `${tenure.years} ${tenure.years === 1 ? 'año' : 'años'}` : null,
    tenure.months ? `${tenure.months} ${tenure.months === 1 ? 'mes' : 'meses'}` : null,
    tenure.days ? `${tenure.days} ${tenure.days === 1 ? 'día' : 'días'}` : null,
  ].filter((unit): unit is string => Boolean(unit));

  if (!units.length) return 'Menos de 1 día';
  if (units.length === 1) return units[0];
  return `${units.slice(0, -1).join(', ')} y ${units.at(-1)}`;
}
