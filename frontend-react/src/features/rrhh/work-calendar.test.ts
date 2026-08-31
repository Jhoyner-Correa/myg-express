import { describe, expect, it } from 'vitest';
import { buildMonthGrid, monthBounds, shiftMonth } from './work-calendar';

describe('calendario mensual', () => {
  it('construye seis semanas empezando en lunes', () => {
    const days = buildMonthGrid('2026-08', new Date(2026, 7, 21));
    expect(days).toHaveLength(42);
    expect(days[0]!.date).toBe('2026-07-27');
    expect(days.find(day => day.date === '2026-08-21')?.isToday).toBe(true);
  });

  it('calcula límites y navegación entre años', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', until: '2026-02-28' });
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});
