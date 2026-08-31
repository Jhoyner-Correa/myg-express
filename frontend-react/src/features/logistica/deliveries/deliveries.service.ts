import apiClient from '../../../core/api/apiClient';
import { unwrapApiData, type ApiEnvelope } from '../../../core/api/types';
import type { DeliveryClient, DeliveryFilters, DeliveryPackage, DeliveryRouteOption, DeliveryStats } from './types';

export const deliveriesService = {
  async stats(signal?: AbortSignal) {
    const response = await apiClient.get<ApiEnvelope<DeliveryStats>>('/entregas/resumen', { signal });
    return unwrapApiData(response.data, { total: 0, pendientes: 0, recogidos: 0 });
  },

  async routes(signal?: AbortSignal) {
    const response = await apiClient.get<ApiEnvelope<DeliveryRouteOption[]>>('/lotes', { signal });
    return unwrapApiData(response.data, []);
  },

  async searchClients(filters: DeliveryFilters, signal?: AbortSignal) {
    const response = await apiClient.get<ApiEnvelope<DeliveryClient[]>>('/entregas/clientes', {
      signal,
      params: {
        q: filters.query.trim(),
        estado: filters.status,
        fecha: filters.date,
        lote_id: filters.routeId,
        limit: 40,
      },
    });
    return unwrapApiData(response.data, []);
  },

  async clientPackages(clientKey: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiEnvelope<DeliveryPackage[]>>(
      `/entregas/clientes/${encodeURIComponent(clientKey)}/paquetes`,
      { signal },
    );
    return unwrapApiData(response.data, []);
  },

  async deliver(packageId: number, observation: string) {
    const response = await apiClient.patch<ApiEnvelope<unknown>>(`/entregas/${packageId}/recoger`, { observacion: observation });
    if (!response.data.ok) throw new Error(response.data.message || 'No se pudo confirmar la entrega.');
  },

  async revert(packageId: number) {
    const response = await apiClient.patch<ApiEnvelope<unknown>>(`/entregas/${packageId}/pendiente`);
    if (!response.data.ok) throw new Error(response.data.message || 'No se pudo revertir la entrega.');
  },
};
