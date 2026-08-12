import type { LookupFilters, NoticeImport, RouteDestination, UrbanoRecord } from './types';

const LIMA_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function normalizeRouteId(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '').slice(0, 20);
}

export function normalizeSearchText(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function displayText(value: unknown): string {
  return String(value ?? '').trim() || 'â€”';
}

export function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '').slice(0, 20);
}

export function formatPhone(value: unknown): string {
  const phone = normalizePhone(value);
  return phone ? phone.replace(/(\d{3})(?=\d)/g, '$1 ').trim() : 'â€”';
}

export function normalizeWeight(value: unknown): number | null {
  const raw = String(value ?? '').replace(',', '.').replace(/[^\d.]/g, '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(3)) : null;
}

export function normalizePositiveInteger(value: unknown): number | null {
  const raw = String(value ?? '').replace(/\D/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function cleanOptionalText(value: unknown, maximum = 255): string | null {
  const clean = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, maximum) : null;
}

export function formatGuide(value: unknown): string {
  return displayText(value).toUpperCase();
}

export function formatLocality(value: unknown): string {
  const clean = displayText(value).replace(/\s*\([^)]*\)\s*/g, '').trim();
  return clean || 'â€”';
}

export function getLimaDateKey(date = new Date()): string {
  return LIMA_DATE_FORMATTER.format(date);
}

export function activeDestinationsForToday(routes: RouteDestination[], now = new Date()): RouteDestination[] {
  const today = getLimaDateKey(now);
  return routes.filter(route => String(route.fecha ?? '').startsWith(today)
    && !['completado', 'cancelado'].includes(String(route.estado ?? '').toLowerCase()));
}

export function uniqueLocalities(records: UrbanoRecord[]): string[] {
  return [...new Set(records.map(record => String(record.localidad ?? '').trim()).filter(value => value && value !== '-'))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

export function filterLookupRecords(records: UrbanoRecord[], filters: LookupFilters): UrbanoRecord[] {
  const filtered = records.filter(record => {
    if (filters.locality && record.localidad !== filters.locality) return false;
    const isTemu = normalizeSearchText(record.contrato).includes('temu');
    if (filters.contract === 'temu' && !isTemu) return false;
    if (filters.contract === 'no-temu' && isTemu) return false;
    return true;
  });

  if (filters.sort === 'default') return filtered;
  const field = filters.sort.replace('-asc', '') as 'guia' | 'cliente' | 'localidad';
  return filtered.toSorted((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'es', { numeric: true, sensitivity: 'base' }));
}

export function destinationLabel(route: RouteDestination): string {
  const name = displayText(route.nombre_lote).replace(/^Ruta\s*\d+\s*[-.]\s*/i, '').trim();
  const zone = String(route.zona ?? '').trim();
  return `${zone || name} Â· MYG-${route.id}`;
}

export function toNoticeImport(record: UrbanoRecord): NoticeImport {
  return {
    nombre: cleanOptionalText(record.cliente),
    telefono: normalizePhone(record.telefono),
    codigo_paquete: cleanOptionalText(record.guia, 100),
    peso_kg: normalizeWeight(record.peso_kg ?? record.peso),
    tipo_paquete_urbano: cleanOptionalText(record.tipo_paquete_urbano ?? record.tipo_paquete, 80),
    piezas: normalizePositiveInteger(record.piezas),
    contenido_paquete: cleanOptionalText(record.contenido_paquete ?? record.guia_contenido),
    empresa_origen: 'Urbano',
    mensaje: null,
  };
}
