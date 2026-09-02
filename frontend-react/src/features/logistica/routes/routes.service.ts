import apiClient from '../../../core/api/apiClient';
import type { RouteItem, RouteNoticeSummaryItem, ZoneItem } from './types';

type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  message?: string;
};

type RequestOptions = { signal?: AbortSignal };

function readData<T>(response: ApiEnvelope<T>): T {
  if (!response.ok) throw new Error(response.message || 'La operación no pudo completarse.');
  return response.data;
}

export type CreateRouteInput = {
  origen: string;
  nombre_lote: string;
};

export const routesService = {
  async listRoutes(options: RequestOptions = {}): Promise<RouteItem[]> {
    const response = await apiClient.get<ApiEnvelope<RouteItem[]>>('/lotes', options);
    return readData(response.data) ?? [];
  },

  async listZones(options: RequestOptions = {}): Promise<ZoneItem[]> {
    const response = await apiClient.get<ApiEnvelope<ZoneItem[]>>('/zonas', options);
    return readData(response.data) ?? [];
  },

  async createRoute(input: CreateRouteInput): Promise<void> {
    const response = await apiClient.post<ApiEnvelope<unknown>>('/lotes', input);
    readData(response.data);
  },

  async renameRoute(routeId: number, name: string): Promise<void> {
    const response = await apiClient.put<ApiEnvelope<unknown>>(`/lotes/${routeId}`, { nombre_lote: name });
    readData(response.data);
  },

  async deleteRoute(routeId: number): Promise<void> {
    const response = await apiClient.delete<ApiEnvelope<unknown>>(`/lotes/${routeId}`);
    readData(response.data);
  },

  async createZone(name: string): Promise<void> {
    const response = await apiClient.post<ApiEnvelope<unknown>>('/zonas', { nombre: name });
    readData(response.data);
  },

  async deleteZone(zoneId: number): Promise<void> {
    const response = await apiClient.delete<ApiEnvelope<unknown>>(`/zonas/${zoneId}`);
    readData(response.data);
  },

  async listRouteNotices(routeId: number): Promise<RouteNoticeSummaryItem[]> {
    const response = await apiClient.get<ApiEnvelope<RouteNoticeSummaryItem[]>>(`/avisos/lote/${routeId}`);
    return readData(response.data) ?? [];
  },
};
