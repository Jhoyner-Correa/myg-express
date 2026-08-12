import { describe, expect, it } from 'vitest';
import { activeDestinationsForToday, filterLookupRecords, formatLocality, normalizePhone, normalizeRouteId, normalizeWeight, toNoticeImport, uniqueLocalities } from './domain';
import type { RouteDestination, UrbanoRecord } from './types';

const base: UrbanoRecord = { routeId: '100', guia: 'WYB-1', rastreo: 'R-1', cliente: 'Mar\u00eda', telefono: '+51 987-654-321', contrato: 'TEMU PERU', localidad: 'SATIPO (JUNIN)' };

describe('dominio de Consulta de rutas', () => {
  it('normaliza identificadores, tel\u00e9fonos y pesos', () => {
    expect(normalizeRouteId(' ruta 001-23 abc ')).toBe('00123');
    expect(normalizePhone('+51 987-654-321')).toBe('51987654321');
    expect(normalizeWeight('1,250 kg')).toBe(1.25);
    expect(normalizeWeight(null)).toBeNull();
  });

  it('filtra contratos/localidad sin alterar el arreglo original', () => {
    const nonTemu = { ...base, guia: 'WYB-2', contrato: 'URBANO', localidad: 'MAZAMARI' };
    const records = [base, nonTemu];
    expect(filterLookupRecords(records, { locality: '', contract: 'no-temu', sort: 'default' })).toEqual([nonTemu]);
    expect(filterLookupRecords(records, { locality: 'SATIPO (JUNIN)', contract: '', sort: 'default' })).toEqual([base]);
    expect(records).toEqual([base, nonTemu]);
    expect(uniqueLocalities(records)).toEqual(['MAZAMARI', 'SATIPO (JUNIN)']);
    expect(formatLocality(base.localidad)).toBe('SATIPO');
  });

  it('solo ofrece rutas activas del d\u00eda empresarial de Lima', () => {
    const routes: RouteDestination[] = [
      { id: 1, nombre_lote: 'Activa', estado: 'pendiente', fecha: '2026-08-12T08:00:00-05:00' },
      { id: 2, nombre_lote: 'Finalizada', estado: 'completado', fecha: '2026-08-12T09:00:00-05:00' },
      { id: 3, nombre_lote: 'Anterior', estado: 'pendiente', fecha: '2026-08-11T09:00:00-05:00' },
    ];
    expect(activeDestinationsForToday(routes, new Date('2026-08-13T02:00:00Z')).map(route => route.id)).toEqual([1]);
  });

  it('convierte un registro Urbano a un aviso importable y limpia HTML', () => {
    expect(toNoticeImport({ ...base, cliente: '<b>Mar\u00eda</b>', piezas: 2, peso_kg: 1.5 })).toMatchObject({
      nombre: 'Mar\u00eda', telefono: '51987654321', codigo_paquete: 'WYB-1', peso_kg: 1.5, piezas: 2, empresa_origen: 'Urbano', mensaje: null,
    });
  });
});
