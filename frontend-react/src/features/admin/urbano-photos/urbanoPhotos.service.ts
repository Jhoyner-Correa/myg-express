import apiClient from '../../../core/api/apiClient';
import type { ApiEnvelope } from '../../../core/api/types';
import type {
  AuditLogEntry,
  BulkPhotosResponse,
  UrbanoPhotoItem,
  UrbanoSiteOption,
} from './types';

export const urbanoPhotosService = {
  async fetchSites(signal?: AbortSignal): Promise<UrbanoSiteOption[]> {
    const response = await apiClient.get<ApiEnvelope<UrbanoSiteOption[]>>(
      '/admin/urbano-despachos/sedes',
      { signal }
    );
    return response.data?.data ?? [];
  },

  async consultarGuias(
    siteId: number,
    text: string,
    routeId?: string,
    signal?: AbortSignal
  ): Promise<BulkPhotosResponse> {
    const response = await apiClient.post<ApiEnvelope<any>>(
      '/admin/urbano-fotos/consultar',
      {
        site_id: siteId,
        text,
        route_id: routeId?.trim() || undefined,
      },
      { signal }
    );

    if (!response.data?.ok) {
      throw new Error(response.data?.message || 'Error al consultar fotografías');
    }

    return {
      data: response.data.data ?? [],
      summary: (response.data as any)?.summary ?? {
        total: 0,
        conFotos: 0,
        sinFotos: 0,
        sinDetalleRuta: 0,
        noEncontradas: 0,
        errores: 0,
      },
    };
  },

  async consultarFotosGuia(
    siteId: number,
    manIdDet: string,
    signal?: AbortSignal
  ): Promise<UrbanoPhotoItem[]> {
    const response = await apiClient.get<ApiEnvelope<UrbanoPhotoItem[]>>(
      `/admin/urbano-fotos/guia/${encodeURIComponent(manIdDet)}`,
      {
        params: { site_id: siteId },
        signal,
      }
    );
    return response.data?.data ?? [];
  },

  async subirFoto(
    siteId: number,
    manIdDet: string,
    guia: string,
    file: File,
    signal?: AbortSignal
  ): Promise<{ message: string; fotos: UrbanoPhotoItem[] }> {
    const formData = new FormData();
    formData.append('site_id', String(siteId));
    formData.append('man_id_det', manIdDet);
    formData.append('guia', guia);
    formData.append('foto', file);

    const response = await apiClient.post<ApiEnvelope<{ message: string; fotos: UrbanoPhotoItem[] }>>(
      '/admin/urbano-fotos/subir',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        signal,
      }
    );

    if (!response.data?.ok) {
      throw new Error(response.data?.message || 'Error al subir la fotografía');
    }

    return {
      message: response.data.message || 'Fotografía subida correctamente.',
      fotos: (response.data as any).fotos ?? [],
    };
  },

  async eliminarFoto(
    siteId: number,
    manIdDet: string,
    guia: string,
    imgId: string,
    signal?: AbortSignal
  ): Promise<{ message: string; fotos: UrbanoPhotoItem[] }> {
    const response = await apiClient.post<ApiEnvelope<{ message: string; fotos: UrbanoPhotoItem[] }>>(
      '/admin/urbano-fotos/eliminar',
      {
        site_id: siteId,
        man_id_det: manIdDet,
        guia,
        img_id: imgId,
      },
      { signal }
    );

    if (!response.data?.ok) {
      throw new Error(response.data?.message || 'Error al eliminar la fotografía');
    }

    return {
      message: response.data.message || 'Fotografía eliminada satisfactoriamente.',
      fotos: (response.data as any).fotos ?? [],
    };
  },

  async asociarManIdDet(
    siteId: number,
    guia: string,
    manIdDet: string,
    routeId?: string,
    signal?: AbortSignal
  ): Promise<string> {
    const response = await apiClient.post<ApiEnvelope<{ message: string }>>(
      '/admin/urbano-fotos/asociar',
      {
        site_id: siteId,
        guia,
        man_id_det: manIdDet,
        route_id: routeId?.trim() || undefined,
      },
      { signal }
    );

    if (!response.data?.ok) {
      throw new Error(response.data?.message || 'Error al asociar identificador');
    }

    return response.data.message || 'Identificador asociado exitosamente.';
  },

  async resolverRuta(
    siteId: number,
    routeId: string,
    signal?: AbortSignal
  ): Promise<{ count: number; message: string }> {
    const response = await apiClient.post<ApiEnvelope<{ count: number; message: string }>>(
      '/admin/urbano-fotos/resolver-ruta',
      {
        site_id: siteId,
        route_id: routeId.trim(),
      },
      { signal }
    );

    if (!response.data?.ok) {
      throw new Error(response.data?.message || 'Error al resolver ruta en Urbano');
    }

    return {
      count: (response.data as any).count ?? 0,
      message: response.data.message || 'Ruta resuelta.',
    };
  },

  async obtenerHistorial(
    siteId?: number,
    guia?: string,
    limit = 50,
    signal?: AbortSignal
  ): Promise<AuditLogEntry[]> {
    const response = await apiClient.get<ApiEnvelope<AuditLogEntry[]>>(
      '/admin/urbano-fotos/historial',
      {
        params: {
          site_id: siteId || undefined,
          guia: guia?.trim() || undefined,
          limit,
        },
        signal,
      }
    );
    return response.data?.data ?? [];
  },
};
