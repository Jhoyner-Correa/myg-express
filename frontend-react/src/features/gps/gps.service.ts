import apiClient from '../../core/api/apiClient';
import type { ApiEnvelope } from '../../core/api/types';
import { unwrapApiData } from '../../core/api/types';
import type {
  GpsHistoryApiPoint,
  GpsHistoryPoint,
  GpsSiteScope,
  LiveGpsApiPosition,
  LiveGpsPosition,
} from './types';

function optionalNumber(value: number | string | null) {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinates(position: LiveGpsApiPosition) {
  const latitude = optionalNumber(position.latitud);
  const longitude = optionalNumber(position.longitud);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { latitude: null, longitude: null };
  }
  return { latitude, longitude };
}

function normalizePosition(position: LiveGpsApiPosition, sites: Map<number, GpsSiteScope>): LiveGpsPosition {
  const siteId = Number(position.sede_id);
  const knownSite = sites.get(siteId);
  return {
    employeeId: Number(position.empleado_id),
    employeeCode: String(position.codigo_empleado),
    names: String(position.nombres),
    lastNames: String(position.apellidos),
    gender: position.sexo === 'F' ? 'F' : 'M',
    photo: position.foto?.trim() || null,
    jobRole: String(position.cargo_nombre),
    siteId,
    siteName: String(position.sede_nombre || knownSite?.name || `Sede ${siteId}`),
    ...coordinates(position),
    speedKmh: optionalNumber(position.velocidad_kmh) ?? 0,
    accuracyMeters: optionalNumber(position.precision_gps),
    movement: position.estado_movimiento,
    batteryPercent: optionalNumber(position.porcentaje_bateria),
    updatedAt: position.ultima_actualizacion ? String(position.ultima_actualizacion) : null,
    shiftState: position.estado_jornada,
  };
}

function normalizeHistoryPoint(point: GpsHistoryApiPoint): GpsHistoryPoint | null {
  const latitude = Number(point.latitud);
  const longitude = Number(point.longitud);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    latitude,
    longitude,
    speedKmh: optionalNumber(point.velocidad_kmh) ?? 0,
    accuracyMeters: optionalNumber(point.precision_gps),
    movement: point.estado_movimiento,
    batteryPercent: optionalNumber(point.porcentaje_bateria),
    recordedAt: String(point.registrado_en),
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
      .sort((left, right) => (Date.parse(right.updatedAt ?? '') || 0) - (Date.parse(left.updatedAt ?? '') || 0));
  },

  async getEmployeeHistory(employeeId: number, date: string, signal?: AbortSignal) {
    const response = await apiClient.get<ApiEnvelope<GpsHistoryApiPoint[]>>(`/gps/historial/empleado/${employeeId}`, {
      params: { fecha: date }, signal,
    });
    return unwrapApiData(response.data, [])
      .map(normalizeHistoryPoint)
      .filter((point): point is GpsHistoryPoint => point !== null);
  },
};
