import apiClient from '../../../core/api/apiClient';
import type { ApiEnvelope } from '../../../core/api/types';
import { unwrapApiData } from '../../../core/api/types';
import type {
  JntBatchDetailData,
  JntBatchHeader,
  JntWhatsAppCreatePayload
} from './types';

export const jntService = {
  async uploadPdf(file: File, onProgress?: (percent: number) => void): Promise<{ lote_id: number; data: JntBatchDetailData }> {
    const formData = new FormData();
    formData.append('pdf', file);

    const response = await apiClient.post<ApiEnvelope<JntBatchDetailData> & { lote_id: number }>('/jnt/upload-pdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      }
    });

    return {
      lote_id: response.data.lote_id,
      data: response.data.data!
    };
  },

  async listBatches(signal?: AbortSignal): Promise<JntBatchHeader[]> {
    const response = await apiClient.get<ApiEnvelope<JntBatchHeader[]>>('/jnt/lotes', { signal });
    return unwrapApiData(response.data, []);
  },

  async getBatchDetails(id: number, signal?: AbortSignal): Promise<JntBatchDetailData> {
    const response = await apiClient.get<ApiEnvelope<JntBatchDetailData>>(`/jnt/lotes/${id}`, { signal });
    return unwrapApiData(response.data);
  },

  async deleteBatch(id: number): Promise<void> {
    await apiClient.delete(`/jnt/lotes/${id}`);
  },

  async createWhatsAppRoute(payload: JntWhatsAppCreatePayload): Promise<{ lote_carga_id: number; total_avisos: number }> {
    const response = await apiClient.post<ApiEnvelope<unknown> & { lote_carga_id: number; total_avisos: number }>(
      '/jnt/crear-lote-whatsapp',
      payload
    );
    return {
      lote_carga_id: response.data.lote_carga_id,
      total_avisos: response.data.total_avisos
    };
  }
};
