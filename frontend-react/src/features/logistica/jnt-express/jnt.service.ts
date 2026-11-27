import apiClient from '../../../core/api/apiClient';
import type { ApiEnvelope } from '../../../core/api/types';
import { unwrapApiData } from '../../../core/api/types';
import type {
  JntAvailableRoute,
  JntBatchDetailData,
  JntBatchHeader,
  JntSendToRouteResult,
  JntWhatsAppCreatePayload
} from './types';

export const jntService = {
  async uploadPdf(
    file: File,
    onProgress?: (percent: number) => void,
    customName?: string
  ): Promise<{ lote_id: number; data: JntBatchDetailData }> {
    const formData = new FormData();
    formData.append('pdf', file);
    if (customName && customName.trim()) {
      formData.append('nombre_lote', customName.trim());
    }

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

  async renameBatch(id: number, nombre: string): Promise<{ id: number; nombre_archivo: string }> {
    const response = await apiClient.patch<ApiEnvelope<{ id: number; nombre_archivo: string }>>(`/jnt/lotes/${id}`, { nombre });
    return unwrapApiData(response.data);
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

  async listAvailableRoutes(loteJntId?: number, signal?: AbortSignal): Promise<JntAvailableRoute[]> {
    const response = await apiClient.get<ApiEnvelope<JntAvailableRoute[]>>('/jnt/rutas-disponibles', {
      params: loteJntId ? { lote_jnt_id: loteJntId } : undefined,
      signal,
    });
    return unwrapApiData(response.data, []);
  },

  async createWhatsAppRoute(payload: JntWhatsAppCreatePayload): Promise<JntSendToRouteResult> {
    const response = await apiClient.post<ApiEnvelope<unknown> & JntSendToRouteResult>(
      '/jnt/crear-lote-whatsapp',
      payload
    );
    return {
      lote_carga_id: response.data.lote_carga_id,
      nombre_ruta: response.data.nombre_ruta || payload.nombre_lote || 'Ruta J&T',
      total_avisos: response.data.total_avisos,
      omitidos: Number(response.data.omitidos || 0)
    };
  }
};
