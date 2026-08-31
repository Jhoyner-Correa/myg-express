import { describe, expect, it } from 'vitest';
import { formatDurationMinutes, formatScheduleRange, formatScheduleTime } from './attendance-formatters';

describe('formatDurationMinutes', () => {
  it('mantiene minutos cuando la duración es menor de una hora', () => {
    expect(formatDurationMinutes(18)).toBe('18 min');
  });

  it('convierte duraciones extensas a horas y minutos', () => {
    expect(formatDurationMinutes(462)).toBe('7 h 42 min');
  });

  it('omite minutos cuando la hora es exacta', () => {
    expect(formatDurationMinutes(120)).toBe('2 h');
  });
});

describe('formatScheduleTime', () => {
  it('muestra horas SQL en formato de 12 horas', () => {
    expect(formatScheduleTime('09:00:00')).toBe('9:00 a. m.');
    expect(formatScheduleTime('13:05:00')).toBe('1:05 p. m.');
    expect(formatScheduleTime('20:00')).toBe('8:00 p. m.');
  });

  it('maneja correctamente medianoche, mediodía y rangos', () => {
    expect(formatScheduleTime('00:00:00')).toBe('12:00 a. m.');
    expect(formatScheduleTime('12:00:00')).toBe('12:00 p. m.');
    expect(formatScheduleRange('09:00:00', '20:00:00')).toBe('9:00 a. m. – 8:00 p. m.');
  });

  it('tolera datos ausentes o no reconocidos', () => {
    expect(formatScheduleTime(null)).toBe('—');
    expect(formatScheduleTime('hora inválida')).toBe('hora inválida');
  });
});
