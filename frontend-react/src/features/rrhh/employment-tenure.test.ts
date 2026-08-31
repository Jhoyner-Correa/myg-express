import { describe, expect, it } from 'vitest';
import { calculateEmploymentTenure, dateInPeru, formatEmploymentTenure } from './employment-tenure';

describe('antigüedad laboral', () => {
  it('calcula años, meses y días de calendario', () => {
    expect(calculateEmploymentTenure('2025-04-15', '2026-08-18')).toEqual({ years: 1, months: 4, days: 3 });
  });

  it('calcula correctamente el ejemplo de agosto', () => {
    const tenure = calculateEmploymentTenure('2025-08-15', '2026-08-18');
    expect(tenure).toEqual({ years: 1, months: 0, days: 3 });
    expect(formatEmploymentTenure(tenure)).toBe('1 año y 3 días');
  });

  it('respeta aniversarios de años bisiestos', () => {
    expect(calculateEmploymentTenure('2024-02-29', '2025-02-28')).toEqual({ years: 1, months: 0, days: 0 });
  });

  it('rechaza fechas inválidas o anteriores al ingreso', () => {
    expect(calculateEmploymentTenure('2026-08-18', '2025-08-18')).toBeNull();
    expect(calculateEmploymentTenure('fecha-inválida', '2026-08-18')).toBeNull();
    expect(formatEmploymentTenure(null)).toBe('—');
  });

  it('obtiene la fecha civil de Perú sin depender de la zona horaria del navegador', () => {
    expect(dateInPeru(new Date('2026-08-19T03:30:00.000Z'))).toBe('2026-08-18');
  });
});
