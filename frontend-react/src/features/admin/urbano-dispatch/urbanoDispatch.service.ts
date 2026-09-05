import apiClient from '../../../core/api/apiClient';
import { unwrapApiData, type ApiEnvelope } from '../../../core/api/types';
import type {
  UrbanoDispatchListQuery,
  UrbanoDispatchListResult,
  UrbanoDispatchQuery,
  UrbanoDispatchResult,
  UrbanoDispatchSite,
  UrbanoGuideDetail,
} from './types';

export const urbanoDispatchService = {
  async sites(signal?: AbortSignal): Promise<UrbanoDispatchSite[]> {
    const response = await apiClient.get<ApiEnvelope<UrbanoDispatchSite[]>>(
      '/admin/urbano-despachos/sedes',
      { signal },
    );
    return unwrapApiData(response.data, []);
  },

  async lookup(query: UrbanoDispatchQuery, signal?: AbortSignal): Promise<UrbanoDispatchResult> {
    const response = await apiClient.get<ApiEnvelope<UrbanoDispatchResult>>(
      '/admin/urbano-despachos/guias',
      {
        signal,
        params: {
          site_id: query.siteId,
          dispatch_id: query.dispatchId,
          line: query.line,
          page: query.page,
          limit: query.limit,
        },
      },
    );
    return unwrapApiData(response.data);
  },

  async dispatches(query: UrbanoDispatchListQuery, signal?: AbortSignal): Promise<UrbanoDispatchListResult> {
    const response = await apiClient.get<ApiEnvelope<UrbanoDispatchListResult>>(
      '/admin/urbano-despachos',
      {
        signal,
        params: {
          site_id: query.siteId,
          from_date: query.fromDate,
          to_date: query.toDate,
        },
      },
    );
    return unwrapApiData(response.data);
  },

  async guideDetails(siteId: number, guide: string, signal?: AbortSignal): Promise<UrbanoGuideDetail> {
    const response = await apiClient.get<ApiEnvelope<UrbanoGuideDetail>>(
      '/admin/urbano-despachos/guias/detalle',
      { signal, params: { site_id: siteId, guide } },
    );
    return unwrapApiData(response.data);
  },
};
