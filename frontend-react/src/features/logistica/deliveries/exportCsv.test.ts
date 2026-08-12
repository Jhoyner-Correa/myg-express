import { describe, expect, it } from 'vitest';
import { buildDeliveriesCsv } from './exportCsv';
import type { DeliveryPackage } from './types';

const packageItem: DeliveryPackage = {
  id: 1,
  lote_id: 8,
  cliente: 'MarÃ­a "MÃ­a"',
  telefono: '987654321',
  codigo_paquete: '=HYPERLINK("https://example.test")',
  fecha_ingreso: '2026-08-12T10:00:00',
  peso_kg: 2,
  estado_entrega: 'pendiente',
  ruta: { nombre: 'MYG-8', zona: 'Villa Rica' },
};

describe('exportaciÃ³n CSV de entregas', () => {
  it('genera UTF-8, escapa comillas y neutraliza fÃ³rmulas de hoja de cÃ¡lculo', () => {
    const csv = buildDeliveriesCsv([packageItem]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"MarÃ­a ""MÃ­a"""');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
    expect(csv.split('\r\n')).toHaveLength(2);
  });
});
