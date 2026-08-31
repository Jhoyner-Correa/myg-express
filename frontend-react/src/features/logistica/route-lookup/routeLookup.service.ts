import apiClient from '../../../core/api/apiClient';
import { unwrapApiData, type ApiEnvelope } from '../../../core/api/types';
import type { CachedRouteLookup, NoticeImport, RouteDestination, RouteLookupResult, UrbanoStatus } from './types';

export const routeLookupService = {
  async status(signal?: AbortSignal): Promise<UrbanoStatus> {
    const response = await apiClient.get<ApiEnvelope<UrbanoStatus>>('/produccion/status', { signal });
    return unwrapApiData(response.data, { connected: false });
  },

  async destinations(signal?: AbortSignal): Promise<RouteDestination[]> {
    const response = await apiClient.get<ApiEnvelope<RouteDestination[]>>('/lotes', { signal });
    return unwrapApiData(response.data, []);
  },

  async latest(signal?: AbortSignal): Promise<CachedRouteLookup | null> {
    const response = await apiClient.get<ApiEnvelope<CachedRouteLookup | null>>('/produccion/cache/ultima', { signal });
    return unwrapApiData(response.data, null);
  },

  async lookup(routeId: string, signal?: AbortSignal): Promise<RouteLookupResult> {
    const response = await apiClient.get<ApiEnvelope<RouteLookupResult>>(`/produccion/rutas/${encodeURIComponent(routeId)}`, { signal });
    return unwrapApiData(response.data);
  },

  async importNotices(routeId: number, notices: NoticeImport[]): Promise<{ imported: number; skipped: number }> {
    const response = await apiClient.post<ApiEnvelope<unknown> & { importados?: number; omitidos?: number }>('/avisos/importar', { lote_id: routeId, avisos: notices });
    if (!response.data.ok) throw new Error(response.data.message || 'No se pudieron importar los registros.');
    return { imported: Number(response.data.importados ?? notices.length), skipped: Number(response.data.omitidos ?? 0) };
  },
};
