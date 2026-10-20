import { describe, expect, it } from 'vitest';
import { buildAuditCsvRows } from './exportExcel';
import type { AuditedGuideResult } from './types';

describe('exportExcel - buildAuditCsvRows', () => {
  it('genera un CSV compatible con Excel que incluye diagnósticos y conteo de motivos', () => {
    const mockRecords: AuditedGuideResult[] = [
      {
        guide: 'WYB473662620',
        found: true,
        declared: {
          provider: 'PALOMINO CUBA GARY',
          agency: 'OXAPAMPA II',
          route: '1148434',
          date: '2026-09-30',
          status: 'ENTREGADO',
          cost: 3.0,
          weightKg: 0.39,
        },
        urbano: {
          guide: 'WYB473662620',
          tracking: '935368',
          recipient: 'ROSALY PALOMINO',
          phone: '914640062',
          destination: 'OXAPAMPA',
          address: 'Jr. Heidinger 700',
          status: 'ENTREGA A TITULAR',
          statusDetail: 'Firma:Rosaly Palomino (DNI:75773728)',
          sender: 'Mary Kay Peru',
          service: 'Distribución',
          contract: 'Mary Kay',
          pieces: 1,
          weightKg: 0.99,
          registeredAt: '28/09/2026',
          estimatedDeliveryDate: '30/09/2026',
          dates: {
            pickup: '28-9',
            dispatched: '29-9',
            admitted: '30-9',
            outForDelivery: 'Mie. 30-9 (1)',
            deadline: '30-9',
          },
        },
        audit: {
          classification: 'ENTREGA_DIRECTA',
          attempts: 1,
          motives: 0,
          isDiscrepancy: false,
          recipientSignature: 'Rosaly Palomino',
          recipientDni: '75773728',
          summaryText: 'Entrega directa limpia al 1er intento (0 motivos)',
        },
        localNotice: null,
      },
      {
        guide: 'WYB465612843',
        found: true,
        declared: {
          provider: 'PALOMINO CUBA GARY',
          agency: 'SATIPO',
          route: '1144777',
          date: '2026-09-23',
          status: 'ENTREGADO',
          cost: 20.0,
          weightKg: 45.0,
        },
        urbano: {
          guide: 'WYB465612843',
          tracking: '99999',
          recipient: 'CLIENTE PRUEBA',
          phone: '999999999',
          destination: 'SAN MARTIN',
          address: 'Av. Principal',
          status: 'SE DEVOLVIO EL PRODUCTO',
          statusDetail: 'CIERRE DE GESTION',
          sender: 'Mercado Libre',
          service: 'Distribución',
          contract: 'Mercado Libre',
          pieces: 10,
          weightKg: 45.0,
          registeredAt: '04/08/2026',
          estimatedDeliveryDate: '23/09/2026',
          dates: {
            pickup: '04-8',
            dispatched: '04-8',
            admitted: '27-8',
            outForDelivery: 'PEND',
            deadline: '23-9',
          },
        },
        audit: {
          classification: 'DISCREPANCIA_NO_ENTREGADO',
          attempts: 0,
          motives: 0,
          isDiscrepancy: true,
          recipientSignature: null,
          recipientDni: null,
          summaryText: 'Falsa Entrega: Figura entregada en Excel, pero en Urbano es "SE DEVOLVIO EL PRODUCTO"',
        },
        localNotice: null,
      },
    ];

    const csv = buildAuditCsvRows(mockRecords);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('GUIA WYB,PIEZAS,PESO (KG),PROVEEDOR DECLARADO');
    expect(csv).toContain('WYB473662620,1,0.99,PALOMINO CUBA GARY');
    expect(csv).toContain('WYB465612843,10,45.00,PALOMINO CUBA GARY');
    expect(csv).toContain('ENTREGA A TITULAR');
    expect(csv).toContain('WYB465612843');
    expect(csv).toContain('SI (FALSA ENTREGA)');
  });
});
