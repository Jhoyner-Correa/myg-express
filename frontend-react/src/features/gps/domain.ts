import type { LiveGpsPosition } from './types';

export type SignalHealth = 'online' | 'stale' | 'offline';

export function getSignalHealth(value: string, now = Date.now()): SignalHealth {
  const age = now - Date.parse(value);
  if (!Number.isFinite(age) || age > 10 * 60_000) return 'offline';
  if (age > 2 * 60_000) return 'stale';
  return 'online';
}

export function getMovementLabel(position: Pick<LiveGpsPosition, 'movement' | 'updatedAt'>, now = Date.now()) {
  if (getSignalHealth(position.updatedAt, now) === 'offline') return 'Sin señal reciente';
  if (position.movement === 'VEHICULO') return 'En ruta';
  if (position.movement === 'CAMINANDO') return 'En desplazamiento';
  return 'Detenido';
}
