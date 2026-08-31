import { describe, expect, it } from 'vitest';
import { normalizeAgendaDate } from './agenda-domain';

describe('agenda de RR. HH.', () => {
  it('normaliza fechas DATE, DATETIME e ISO recibidas por la API', () => {
    expect(normalizeAgendaDate('2026-08-17')).toBe('2026-08-17');
    expect(normalizeAgendaDate('2026-08-17 10:00:00')).toBe('2026-08-17');
    expect(normalizeAgendaDate('2026-08-17T15:00:00.000Z')).toBe('2026-08-17');
  });

  it('descarta valores vacíos o fechas inexistentes sin romper la interfaz', () => {
    expect(normalizeAgendaDate(null)).toBeNull();
    expect(normalizeAgendaDate('sin-fecha')).toBeNull();
    expect(normalizeAgendaDate('2026-02-30 10:00:00')).toBeNull();
  });
});

