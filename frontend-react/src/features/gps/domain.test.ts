import { describe, expect, it } from 'vitest';
import { getAccuracyHealth, getMovementLabel, getSignalAgeMinutes, getSignalHealth, getSignalLabel } from './domain';

const now = Date.parse('2026-08-14T15:00:00-05:00');

describe('dominio de monitoreo GPS', () => {
  it('clasifica la vigencia de la última señal', () => {
    expect(getSignalHealth('2026-08-14T14:59:00-05:00', now)).toBe('online');
    expect(getSignalHealth('2026-08-14T14:55:00-05:00', now)).toBe('stale');
    expect(getSignalHealth('2026-08-14T14:40:00-05:00', now)).toBe('offline');
  });

  it('prioriza la pérdida de señal sobre el movimiento anterior', () => {
    expect(getMovementLabel({ movement: 'VEHICULO', updatedAt: '2026-08-14T14:40:00-05:00' }, now)).toBe('Sin conexión reciente');
  });

  it('traduce el movimiento operativo vigente', () => {
    expect(getMovementLabel({ movement: 'VEHICULO', updatedAt: '2026-08-14T14:59:00-05:00' }, now)).toBe('En ruta');
    expect(getMovementLabel({ movement: 'CAMINANDO', updatedAt: '2026-08-14T14:59:00-05:00' }, now)).toBe('En desplazamiento');
    expect(getMovementLabel({ movement: 'DETENIDO', updatedAt: '2026-08-14T14:59:00-05:00' }, now)).toBe('Detenido');
  });

  it('distingue una señal inexistente de una señal vencida', () => {
    expect(getSignalHealth(null, now)).toBe('offline');
    expect(getSignalLabel(null, now)).toBe('Sin ubicación');
    expect(getSignalLabel('2026-08-14T14:40:00-05:00', now)).toBe('Sin conexión');
    expect(getSignalAgeMinutes(null, now)).toBeNull();
  });

  it('clasifica la precisión reportada por el dispositivo', () => {
    expect(getAccuracyHealth(12)).toBe('good');
    expect(getAccuracyHealth(35)).toBe('fair');
    expect(getAccuracyHealth(80)).toBe('poor');
    expect(getAccuracyHealth(null)).toBe('unknown');
  });
});
