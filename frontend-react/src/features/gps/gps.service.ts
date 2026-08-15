import apiClient from '../../core/api/apiClient';
import type { ApiEnvelope } from '../../core/api/types';
import { unwrapApiData } from '../../core/api/types';
import type { GpsSiteScope, LiveGpsApiPosition, LiveGpsPosition } from './types';

function optionalNumber(value: number | string | null) {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePosition(position: LiveGpsApiPosition, sites: Map<number, GpsSiteScope>): LiveGpsPosition | null {
  const latitude = Number(position.latitud);
  const longitude = Number(position.longitud);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const siteId = Number(position.sede_id);
  const knownSite = sites.get(siteId);
  return {
    employeeId: Number(position.empleado_id),
    employeeCode: String(position.codigo_empleado),
    names: String(position.nombres),
    lastNames: String(position.apellidos),
    jobRole: String(position.cargo_nombre),
    siteId,
    siteName: String(position.sede_nombre || knownSite?.name || `Sede ${siteId}`),
    latitude,
    longitude,
    speedKmh: optionalNumber(position.velocidad_kmh) ?? 0,
    accuracyMeters: optionalNumber(position.precision_gps),
    movement: position.estado_movimiento,
    batteryPercent: optionalNumber(position.porcentaje_bateria),
    updatedAt: String(position.ultima_actualizacion),
  };
}

export const gpsService = {
  async getLivePositions(sites: GpsSiteScope[], signal?: AbortSignal) {
    if (!sites.length) return [];
    const siteId = sites.length === 1 ? sites.at(0)?.id ?? null : null;
    const response = await apiClient.get<ApiEnvelope<LiveGpsApiPosition[]>>('/gps/tiempo-real', {
      params: siteId === null ? undefined : { sede_id: siteId }, signal,
    });
    const siteMap = new Map(sites.map(site => [site.id, site]));
    return unwrapApiData(response.data, [])
      .map(position => normalizePosition(position, siteMap))
      .filter((position): position is LiveGpsPosition => position !== null)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  },
};
