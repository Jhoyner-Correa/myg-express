import { assertDateOnly } from '../../../core/utils/time';
import { WorkCalendarScope } from './workCalendarPolicy';

export type HolidayProposalDecision =
  | 'NO_LABORABLE'
  | 'JORNADA_NORMAL'
  | 'JORNADA_ESPECIAL'
  | 'DESCARTAR';

export type HolidayDecisionInput = {
  decision: unknown;
  scope: unknown;
  siteId: unknown;
  scheduleId: unknown;
  comment: unknown;
};

export type NormalizedHolidayDecision = {
  decision: HolidayProposalDecision;
  scope: WorkCalendarScope;
  siteId: number | null;
  scheduleId: number | null;
  comment: string | null;
};

export type ExternalHoliday = {
  externalKey: string;
  date: string;
  localName: string;
  internationalName: string | null;
  sourceType: string;
  global: boolean;
  subdivisions: string[];
  sourceUrl: string;
  raw: unknown;
};

const DECISIONS: HolidayProposalDecision[] = [
  'NO_LABORABLE', 'JORNADA_NORMAL', 'JORNADA_ESPECIAL', 'DESCARTAR',
];

function safeName(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim().slice(0, 160) : fallback;
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

export function normalizeNagerHolidayPayload(payload: unknown, year: number, sourceUrl: string): ExternalHoliday[] {
  if (!Array.isArray(payload)) throw new Error('El proveedor de feriados devolvió una respuesta no válida.');
  const byKey = new Map<string, ExternalHoliday>();
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const countryCode = safeName(item.countryCode).toUpperCase();
    let date: string;
    try {
      date = assertDateOnly(item.date);
    } catch {
      // Una fila corrupta del proveedor no debe invalidar todo el calendario anual.
      continue;
    }
    if (countryCode !== 'PE' || Number(date.slice(0, 4)) !== year) continue;
    const localName = safeName(item.localName, safeName(item.name));
    if (localName.length < 2) continue;
    const types = Array.isArray(item.types) ? item.types.map(value => safeName(value)).filter(Boolean) : [];
    const subdivisions = Array.isArray(item.counties)
      ? item.counties.map(value => safeName(value)).filter(Boolean)
      : [];
    const externalKey = `PE:${date}:${slug(localName)}`;
    byKey.set(externalKey, {
      externalKey,
      date,
      localName,
      internationalName: safeName(item.name) || null,
      sourceType: types[0] || 'Public',
      global: item.global !== false,
      subdivisions,
      sourceUrl,
      raw,
    });
  }
  return [...byKey.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function normalizeHolidayYear(value: unknown): number {
  const year = Number(value);
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(year) || year < currentYear - 2 || year > currentYear + 3) {
    throw new Error(`El año debe estar entre ${currentYear - 2} y ${currentYear + 3}.`);
  }
  return year;
}

export function normalizeHolidayDecision(input: HolidayDecisionInput): NormalizedHolidayDecision {
  const decision = String(input.decision || '').toUpperCase() as HolidayProposalDecision;
  if (!DECISIONS.includes(decision)) throw new Error('Selecciona una decisión operativa válida.');

  const scope = String(input.scope || 'EMPRESA').toUpperCase() as WorkCalendarScope;
  if (scope !== 'EMPRESA' && scope !== 'SEDE') throw new Error('El alcance seleccionado no es válido.');

  const rawSiteId = Number(input.siteId);
  const siteId = scope === 'SEDE' && Number.isInteger(rawSiteId) && rawSiteId > 0 ? rawSiteId : null;
  if (decision !== 'DESCARTAR' && scope === 'SEDE' && siteId === null) {
    throw new Error('Selecciona la sede donde se aplicará la decisión.');
  }

  const rawScheduleId = Number(input.scheduleId);
  const scheduleId = decision === 'JORNADA_ESPECIAL' && Number.isInteger(rawScheduleId) && rawScheduleId > 0
    ? rawScheduleId
    : null;
  if (decision === 'JORNADA_ESPECIAL' && scheduleId === null) {
    throw new Error('Selecciona el horario que se aplicará en la jornada especial.');
  }

  const comment = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (comment.length > 500) throw new Error('El comentario no puede superar 500 caracteres.');

  return { decision, scope, siteId, scheduleId, comment: comment || null };
}
