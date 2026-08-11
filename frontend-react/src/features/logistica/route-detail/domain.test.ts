import { describe, expect, it } from 'vitest';
import { calculateRouteStats, normalizeAvisoVisualStatus, readQueueControl } from './domain';
import type { NoticeItem, RouteDetail } from './types';

function notice(id: number, status: string): NoticeItem {
  return { id, estado_aviso: status, nombre: '', telefono: '', codigo_paquete: '', created_at: '' };
}

describe('route detail domain', () => {
  it('normaliza estados provenientes de la cola', () => {
    expect(normalizeAvisoVisualStatus('processing')).toBe('enviando');
    expect(normalizeAvisoVisualStatus('auth_failure')).toBe('fallido');
    expect(normalizeAvisoVisualStatus('enviado_manual')).toBe('manual');
  });

  it('calcula métricas sin divisiones inválidas', () => {
    expect(calculateRouteStats([]).procesadosPct).toBe(0);
    expect(calculateRouteStats([
      notice(1, 'pendiente'),
      notice(2, 'enviado'),
      notice(3, 'sin_whatsapp'),
      notice(4, 'manual'),
    ])).toMatchObject({ total: 4, pendientes: 1, enviados: 2, fallidos: 1, procesadosPct: 50 });
  });

  it('tolera un control de cola corrupto', () => {
    const route = { control_envio: '{invalid' } as RouteDetail;
    expect(readQueueControl(route)).toBeNull();
  });
});
