import { assertDateOnly } from '../../../core/utils/time';

export type WorkCalendarScope = 'EMPRESA' | 'SEDE';
export type WorkCalendarEventType = 'FERIADO' | 'DIA_NO_LABORABLE' | 'JORNADA_ESPECIAL';

export type WorkCalendarInput = {
  scope: unknown;
  siteId: unknown;
  name: unknown;
  type: unknown;
  startDate: unknown;
  endDate: unknown;
  scheduleId: unknown;
  description: unknown;
};

export type NormalizedWorkCalendarInput = {
  scope: WorkCalendarScope;
  siteId: number | null;
  name: string;
  type: WorkCalendarEventType;
  startDate: string;
  endDate: string;
  scheduleId: number | null;
  description: string | null;
};

const SCOPES: WorkCalendarScope[] = ['EMPRESA', 'SEDE'];
const TYPES: WorkCalendarEventType[] = ['FERIADO', 'DIA_NO_LABORABLE', 'JORNADA_ESPECIAL'];

function inclusiveDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}
export function normalizeWorkCalendarInput(input: WorkCalendarInput): NormalizedWorkCalendarInput {
  const scope = String(input.scope || '').toUpperCase() as WorkCalendarScope;
  if (!SCOPES.includes(scope)) throw new Error('El alcance del calendario no es valido.');

  const type = String(input.type || '').toUpperCase() as WorkCalendarEventType;
  if (!TYPES.includes(type)) throw new Error('El tipo de dia laboral no es valido.');

  const name = String(input.name || '').trim();
  if (name.length < 3 || name.length > 120) {
    throw new Error('El nombre debe tener entre 3 y 120 caracteres.');
  }

  const startDate = assertDateOnly(input.startDate);
  const endDate = assertDateOnly(input.endDate);
  const days = inclusiveDays(startDate, endDate);
  if (days < 1) throw new Error('La fecha final no puede ser anterior a la fecha inicial.');
  if (days > 366) throw new Error('Un evento de calendario no puede superar 366 dias.');

  const rawSiteId = Number(input.siteId);
  const siteId = scope === 'SEDE' && Number.isInteger(rawSiteId) && rawSiteId > 0 ? rawSiteId : null;
  if (scope === 'SEDE' && siteId === null) throw new Error('Selecciona una sede valida.');

  const rawScheduleId = Number(input.scheduleId);
  const scheduleId = type === 'JORNADA_ESPECIAL' && Number.isInteger(rawScheduleId) && rawScheduleId > 0
    ? rawScheduleId
    : null;
  if (type === 'JORNADA_ESPECIAL' && scheduleId === null) {
    throw new Error('Selecciona el horario de la jornada especial.');
  }

  const description = String(input.description || '').trim();
  if (description.length > 500) throw new Error('La descripcion no puede superar 500 caracteres.');

  return {
    scope,
    siteId,
    name,
    type,
    startDate,
    endDate,
    scheduleId,
    description: description || null,
  };
}

export function eventAppliesToSite<T extends { scope: WorkCalendarScope; siteId: number | null }>(
  event: T,
  siteId: number,
): boolean {
  return event.scope === 'EMPRESA' || event.siteId === siteId;
}

export function chooseCalendarEvent<T extends { scope: WorkCalendarScope; siteId: number | null }>(
  events: T[],
  siteId: number,
): T | null {
  return events
    .filter(event => eventAppliesToSite(event, siteId))
    .sort((left, right) => Number(right.scope === 'SEDE') - Number(left.scope === 'SEDE'))[0] ?? null;
}
