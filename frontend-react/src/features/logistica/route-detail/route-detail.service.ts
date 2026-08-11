import apiClient from '../../../core/api/apiClient';
import type { ApiEnvelope } from '../../../core/api/types';
import { unwrapApiData } from '../../../core/api/types';
import type {
  ImportedNotice,
  NoticeItem,
  QueueAction,
  RawTemplateItem,
  RouteDetail,
  SessionItem,
  TemplateInput,
} from './types';

type TemplateEnvelope = ApiEnvelope<RawTemplateItem[]> & {
  default_plantilla_id?: number;
  defaultPlantillaId?: number;
};

type MutationResult = { message?: string; importados?: number };

function mutationResult(envelope: ApiEnvelope<unknown> & MutationResult): MutationResult {
  if (!envelope.ok) throw new Error(envelope.message || 'La operación no pudo completarse.');
  return { message: envelope.message, importados: envelope.importados };
}

export const routeDetailService = {
  async getRoute(routeId: number, signal?: AbortSignal): Promise<RouteDetail> {
    const response = await apiClient.get<ApiEnvelope<RouteDetail>>(`/lotes/${routeId}`, { signal });
    return unwrapApiData(response.data);
  },

  async listNotices(routeId: number, signal?: AbortSignal): Promise<NoticeItem[]> {
    const response = await apiClient.get<ApiEnvelope<NoticeItem[]>>(`/avisos/lote/${routeId}`, { signal });
    return unwrapApiData(response.data, []);
  },

  async listSessions(sedeId?: number, signal?: AbortSignal): Promise<SessionItem[]> {
    const response = await apiClient.get<ApiEnvelope<SessionItem[]>>('/whatsapp-sesiones', {
      params: sedeId ? { sede_id: sedeId } : undefined,
      signal,
    });
    return unwrapApiData(response.data, []);
  },

  async listTemplates(sedeId?: number, signal?: AbortSignal): Promise<{
    items: RawTemplateItem[];
    defaultId?: number;
  }> {
    const response = await apiClient.get<TemplateEnvelope>('/plantillas', {
      params: sedeId ? { sede_id: sedeId } : undefined,
      signal,
    });
    const envelope = response.data;
    return {
      items: unwrapApiData(envelope, []),
      defaultId: envelope.default_plantilla_id ?? envelope.defaultPlantillaId,
    };
  },

  async setDefaultTemplate(templateId: number, sedeId?: number): Promise<void> {
    const response = await apiClient.put<ApiEnvelope<unknown>>('/plantillas/default', {
      plantilla_id: templateId,
      ...(sedeId ? { sede_id: sedeId } : {}),
    });
    mutationResult(response.data);
  },

  async sendRoute(input: {
    routeId: number;
    sessionId: number;
    templateId: number;
    customMessage: string;
  }): Promise<void> {
    const response = await apiClient.post<ApiEnvelope<unknown>>('/whatsapp/enviar-lote', {
      lote_id: input.routeId,
      whatsapp_sesion_id: input.sessionId,
      plantilla_id: input.templateId,
      mensaje_personalizado: input.customMessage,
    });
    mutationResult(response.data);
  },

  async controlQueue(routeId: number, action: QueueAction, sessionId?: number): Promise<MutationResult> {
    const endpoints: Record<QueueAction, string> = {
      pausar: 'pause',
      reanudar: 'resume',
      manual: 'mark-manual',
      cancelar: 'cancel-pending',
    };
    const response = await apiClient.post<ApiEnvelope<unknown> & MutationResult>(
      `/whatsapp/lotes/${routeId}/${endpoints[action]}`,
      action === 'reanudar' ? { whatsapp_sesion_id: sessionId } : {},
    );
    return mutationResult(response.data);
  },

  async createNotice(input: {
    routeId: number;
    name: string;
    phone: string;
    packageCode: string;
    customMessage: string;
    origin: string;
  }): Promise<void> {
    const response = await apiClient.post<ApiEnvelope<unknown>>('/avisos', {
      lote_id: input.routeId,
      nombre: input.name,
      telefono: input.phone,
      codigo_paquete: input.packageCode,
      mensaje_personalizado: input.customMessage,
      empresa_origen: input.origin,
    });
    mutationResult(response.data);
  },

  async deleteNotice(noticeId: number): Promise<void> {
    const response = await apiClient.delete<ApiEnvelope<unknown>>(`/avisos/${noticeId}`);
    mutationResult(response.data);
  },

  async clearNotices(routeId: number): Promise<void> {
    const response = await apiClient.delete<ApiEnvelope<unknown>>(`/avisos/lote/${routeId}`);
    mutationResult(response.data);
  },

  async importNotices(routeId: number, notices: ImportedNotice[]): Promise<number> {
    const response = await apiClient.post<ApiEnvelope<unknown> & MutationResult>('/avisos/importar', {
      lote_id: routeId,
      avisos: notices,
    });
    return mutationResult(response.data).importados ?? notices.length;
  },

  async saveTemplate(templateId: number | null, input: TemplateInput): Promise<void> {
    const response = templateId
      ? await apiClient.put<ApiEnvelope<unknown>>(`/plantillas/${templateId}`, input)
      : await apiClient.post<ApiEnvelope<unknown>>('/plantillas', input);
    mutationResult(response.data);
  },

  async deleteTemplate(templateId: number, sedeId?: number): Promise<void> {
    const response = await apiClient.delete<ApiEnvelope<unknown>>(`/plantillas/${templateId}`, {
      params: sedeId ? { sede_id: sedeId } : undefined,
    });
    mutationResult(response.data);
  },
};
