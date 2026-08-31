import { EMPTY_LOOKUP_FILTERS, type LookupFilters } from './types';

const STORAGE_KEY = 'myg_consulta_rutas_state';
const STATE_TTL_MS = 12 * 60 * 60 * 1000;

export type StoredLookupState = {
  savedAt: number;
  queriedRouteId: string;
  selectedDestinationId: string;
  filters: LookupFilters;
};

export function readLookupState(now = Date.now()): StoredLookupState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLookupState> & {
      selectedLocalidad?: string; selectedContrato?: LookupFilters['contract']; selectedSort?: LookupFilters['sort'];
    };
    if (!Number.isFinite(parsed.savedAt) || now - Number(parsed.savedAt) > STATE_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      savedAt: Number(parsed.savedAt),
      queriedRouteId: String(parsed.queriedRouteId ?? ''),
      selectedDestinationId: String(parsed.selectedDestinationId ?? ''),
      filters: parsed.filters ?? {
        locality: parsed.selectedLocalidad ?? EMPTY_LOOKUP_FILTERS.locality,
        contract: parsed.selectedContrato ?? EMPTY_LOOKUP_FILTERS.contract,
        sort: parsed.selectedSort ?? EMPTY_LOOKUP_FILTERS.sort,
      },
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function writeLookupState(state: Omit<StoredLookupState, 'savedAt'>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, savedAt: Date.now() })); } catch { /* almacenamiento no disponible */ }
}
