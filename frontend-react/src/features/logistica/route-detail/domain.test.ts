import { describe, expect, it } from 'vitest';
import {
  calculateRouteStats,
  countManualClosureEligible,
  normalizeAvisoVisualStatus,
  readQueueControl,
} from './domain';
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

  it('cuenta para cierre manual solo los destinatarios que aún requieren gestión', () => {
    const notices = [
      notice(1, 'pendiente'),
      notice(2, 'en_cola'),
      notice(3, 'fallido'),
      notice(4, 'sin_whatsapp'),
      notice(5, 'enviado'),
      notice(6, 'enviado_manual'),
      notice(7, 'cancelado'),
    ];

    expect(countManualClosureEligible(notices)).toBe(4);
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
