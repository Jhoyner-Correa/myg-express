import axios from 'axios';
import apiClient from '../../../core/api/apiClient';
import type { ApiEnvelope } from '../../../core/api/types';
import { unwrapApiData } from '../../../core/api/types';
import type { ImportedPackage, SavarLot, SavarPackage } from './types';

type MessageEnvelope<T> = ApiEnvelope<T> & { paquete?: T };

export type ScanFailure = {
  status?: number;
  message: string;
  package?: SavarPackage;
};

function mutationMessage(envelope: ApiEnvelope<unknown>) {
  if (!envelope.ok) throw new Error(envelope.message || 'La operación no pudo completarse.');
  return envelope.message;
}

export function readScanFailure(error: unknown): ScanFailure {
  if (!axios.isAxiosError<MessageEnvelope<SavarPackage>>(error)) {
    return { message: error instanceof Error ? error.message : 'No se pudo conectar con el servidor.' };
  }
  return {
    status: error.response?.status,
    message: error.response?.data?.message || error.message || 'No se pudo procesar el escaneo.',
    package: error.response?.data?.data || error.response?.data?.paquete,
  };
}

export const savarScanService = {
  async listLots(signal?: AbortSignal): Promise<SavarLot[]> {
    const response = await apiClient.get<ApiEnvelope<SavarLot[]>>('/savar-scan/lotes', { signal });
    return unwrapApiData(response.data, []);
  },
  async listPackages(params: { status: string; lot?: string; limit?: number }, signal?: AbortSignal) {
    const response = await apiClient.get<ApiEnvelope<SavarPackage[]>>('/savar-scan/paquetes', {
      params: { estado: params.status, lote_importacion: params.lot, limit: params.limit ?? 50 }, signal,
    });
    return unwrapApiData(response.data, []);
  },
  async listMissing(lot: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiEnvelope<SavarPackage[]>>('/savar-scan/faltantes', { params: { lote: lot }, signal });
    return unwrapApiData(response.data, []);
  },
  async scan(code: string, lot: string) {
    const response = await apiClient.post<MessageEnvelope<SavarPackage>>('/savar-scan/procesar', { codigo: code, lote_activo: lot });
    return unwrapApiData(response.data);
  },
  async importPackages(lot: string, packages: ImportedPackage[]) {
    const response = await apiClient.post<ApiEnvelope<unknown>>('/savar-scan/importar', { paquetes: packages, lote_importacion: lot });
    return mutationMessage(response.data);
  },
  async resetLot(lot: string) {
    const response = await apiClient.post<ApiEnvelope<unknown>>('/savar-scan/reset', null, { params: { lote: lot } });
    return mutationMessage(response.data);
  },
  async deleteLot(lot: string) {
    const response = await apiClient.delete<ApiEnvelope<unknown>>(`/savar-scan/lotes/${encodeURIComponent(lot)}`);
    return mutationMessage(response.data);
  },
};
