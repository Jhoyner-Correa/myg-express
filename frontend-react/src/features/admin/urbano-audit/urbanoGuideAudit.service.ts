import apiClient from '../../../core/api/apiClient';
import type { ApiEnvelope } from '../../../core/api/types';
import type { GuideAuditBatchResponse, UrbanoAuditSite } from './types';

export const urbanoGuideAuditService = {
  async sites(signal?: AbortSignal): Promise<UrbanoAuditSite[]> {
    const response = await apiClient.get<ApiEnvelope<UrbanoAuditSite[]>>(
      '/admin/urbano-despachos/sedes',
      { signal },
    );
    return response.data?.data ?? [];
  },

  async auditGuides(
    siteId: number,
    text: string,
    signal?: AbortSignal,
  ): Promise<GuideAuditBatchResponse> {
    const response = await apiClient.post<ApiEnvelope<GuideAuditBatchResponse>>(
      '/admin/urbano-guias/auditoria',
      {
        site_id: siteId,
        text,
      },
      { signal },
    );

    if (!response.data?.ok || !response.data?.data) {
      throw new Error(response.data?.message || 'Error al procesar la auditoría en Urbano');
    }

    return response.data.data;
  },
};
