import type { GpsShiftState, LiveGpsPosition } from './types';

export const GPS_ONLINE_WINDOW_MS = 2 * 60_000;
export const GPS_STALE_WINDOW_MS = 10 * 60_000;

export type SignalHealth = 'online' | 'stale' | 'offline';
export type AccuracyHealth = 'good' | 'fair' | 'poor' | 'unknown';

export function getSignalAgeMinutes(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / 60_000));
}

export function getSignalHealth(value: string | null, now = Date.now()): SignalHealth {
  if (!value) return 'offline';
  const age = now - Date.parse(value);
  if (!Number.isFinite(age) || age > GPS_STALE_WINDOW_MS) return 'offline';
  if (age > GPS_ONLINE_WINDOW_MS) return 'stale';
  return 'online';
}

export function getAccuracyHealth(value: number | null): AccuracyHealth {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value <= 20) return 'good';
  if (value <= 50) return 'fair';
  return 'poor';
}

export function getMovementLabel(position: Pick<LiveGpsPosition, 'movement' | 'updatedAt'>, now = Date.now()) {
  if (getSignalHealth(position.updatedAt, now) === 'offline') return 'Sin conexión reciente';
  if (position.movement === 'VEHICULO') return 'En ruta';
  if (position.movement === 'CAMINANDO') return 'En desplazamiento';
  return 'Detenido';
}

export function getSignalLabel(value: string | null, now = Date.now()) {
  const health = getSignalHealth(value, now);
  if (health === 'online') return 'En línea';
  if (health === 'stale') return 'Señal demorada';
  return value ? 'Sin conexión' : 'Sin ubicación';
}

export function getShiftLabel(value: GpsShiftState) {
  if (value === 'EN_JORNADA') return 'Jornada activa';
  if (value === 'FINALIZADA') return 'Jornada finalizada';
  return 'Jornada sin iniciar';
}

export function hasCoordinates(position: LiveGpsPosition): position is LiveGpsPosition & { latitude: number; longitude: number } {
  return position.latitude !== null && position.longitude !== null;
}
