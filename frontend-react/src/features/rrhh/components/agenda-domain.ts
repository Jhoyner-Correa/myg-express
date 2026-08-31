const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Normalizes MariaDB DATETIME, ISO timestamps and DATE values to the
 * business-calendar representation used by the agenda.
 */
export function normalizeAgendaDate(value: unknown): string | null {
  const match = DATE_PREFIX.exec(String(value ?? '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

