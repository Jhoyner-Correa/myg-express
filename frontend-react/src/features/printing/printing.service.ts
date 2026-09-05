import apiClient from '../../core/api/apiClient';
import { unwrapApiData, type ApiEnvelope } from '../../core/api/types';
import type { CreatePrintJobInput, PrintAgent, PrintJob, PrintPairing, PrintSite } from './types';

export const printingService = {
  async sites(signal?: AbortSignal): Promise<PrintSite[]> {
    const response = await apiClient.get<ApiEnvelope<PrintSite[]>>('/printing/sites', { signal });
    return unwrapApiData(response.data, []);
  },

  async jobs(siteId: number, signal?: AbortSignal): Promise<PrintJob[]> {
    const response = await apiClient.get<ApiEnvelope<PrintJob[]>>('/printing/jobs', {
      signal,
      params: { site_id: siteId, limit: 50 },
    });
    return unwrapApiData(response.data, []);
  },
  async agents(siteId: number): Promise<PrintAgent[]> {
    const response = await apiClient.get<ApiEnvelope<PrintAgent[]>>('/printing/agents', { params: { site_id: siteId } });
    return unwrapApiData(response.data, []);
  },
  async createPairing(siteId: number): Promise<PrintPairing> {
    const response = await apiClient.post<ApiEnvelope<PrintPairing>>('/printing/pairings', { site_id: siteId });
    return unwrapApiData(response.data);
  },
  async selectPrinter(agentId: number, printerName: string): Promise<void> {
    await apiClient.patch(`/printing/agents/${agentId}/printer`, { printer_name: printerName });
  },
  async removeAgent(agentId: number): Promise<void> { await apiClient.delete(`/printing/agents/${agentId}`); },
  async downloadConnector(): Promise<void> {
    const response = await apiClient.get('/printing/connector/download', { responseType: 'blob' });
    const url = URL.createObjectURL(response.data as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'MyGPrintConnector-Setup.exe';
    link.click();
    URL.revokeObjectURL(url);
  },

  async create(input: CreatePrintJobInput): Promise<PrintJob> {
    const response = await apiClient.post<ApiEnvelope<PrintJob>>('/printing/jobs', input);
    return unwrapApiData(response.data);
  },

  async cancel(jobId: number): Promise<void> {
    await apiClient.post(`/printing/jobs/${jobId}/cancel`);
  },

  async retry(jobId: number): Promise<void> {
    await apiClient.post(`/printing/jobs/${jobId}/retry`);
  },
};
