import { describe, expect, it } from 'vitest';
import {
  buildZoneTree,
  filterLots,
  filterMissing,
  filterPackagesByZones,
  filterZoneTree,
  lotProgress,
  mapSpreadsheetRows,
  statusLabel,
  zoneKey,
} from './domain';
import type { ImportedPackage, SavarLot, SavarPackage } from './types';

const packages: ImportedPackage[] = [
  { codigo: '001', consignado: 'Ana', direccion: 'Jr. Uno', telefono: '999', departamento: 'Junín', provincia: 'Satipo', distrito: 'Mazamari' },
  { codigo: '002', consignado: 'Luis', direccion: 'Jr. Dos', telefono: '888', departamento: 'Junín', provincia: 'Satipo', distrito: 'Pangoa' },
  { codigo: '003', consignado: 'Rosa', direccion: 'Jr. Tres', telefono: '777', departamento: 'Pasco', provincia: 'Oxapampa', distrito: 'Villa Rica' },
];

describe('dominio de SAVAR SCAN', () => {
  it('mapea encabezados de Excel flexibles y descarta filas incompletas', () => {
    const result = mapSpreadsheetRows([
      { 'Código paquete': 'SE0001', Cliente: 'María', Celular: 987654321, Provincia: 'Satipo', Zona: 'Mazamari' },
      { 'Código paquete': '', Cliente: 'Inválido' },
      { Código: 'SE0002', Cliente: '' },
    ]);

    expect(result).toEqual([expect.objectContaining({
      codigo: 'SE0001', consignado: 'María', telefono: '987654321', provincia: 'Satipo', distrito: 'Mazamari',
    })]);
  });

  it('normaliza claves de zona sin perder nombres que contienen guiones', () => {
    expect(zoneKey('San Martín - Norte', 'Río Negro')).toBe('SAN MARTÍN - NORTE - RÍO NEGRO');
    expect(buildZoneTree([{ ...packages[0]!, provincia: 'San Martín - Norte' }])).toEqual({
      'SAN MARTÍN - NORTE': { total: 1, districts: { MAZAMARI: 1 } },
    });
  });

  it('agrupa y filtra zonas conservando sus conteos', () => {
    const tree = buildZoneTree(packages);
    expect(tree.SATIPO).toEqual({ total: 2, districts: { MAZAMARI: 1, PANGOA: 1 } });
    expect(filterZoneTree(tree, 'villa')).toEqual({ OXAPAMPA: { total: 1, districts: { 'VILLA RICA': 1 } } });
  });

  it('selecciona únicamente paquetes de las zonas marcadas', () => {
    expect(filterPackagesByZones(packages, new Set(['SATIPO - PANGOA']))).toEqual([packages[1]]);
  });

  it('limita el progreso al rango de cero a cien', () => {
    expect(lotProgress(null)).toBe(0);
    expect(lotProgress({ nombre: 'A', fecha_creacion: '', total: 8, recibidos: 3 })).toBe(38);
    expect(lotProgress({ nombre: 'A', fecha_creacion: '', total: 2, recibidos: 5 })).toBe(100);
  });

  it('filtra lotes por nombre y período', () => {
    const lots: SavarLot[] = [
      { nombre: 'Carga Satipo', fecha_creacion: '2026-08-12T10:00:00', total: 10, recibidos: 2 },
      { nombre: 'Carga Villa Rica', fecha_creacion: '2026-07-12T10:00:00', total: 10, recibidos: 8 },
    ];
    expect(filterLots(lots, 'satipo', '8/2026')).toEqual([lots[0]]);
    expect(filterLots(lots, 'villa', '8/2026')).toEqual([]);
  });

  it('busca faltantes en los campos operativos', () => {
    const items = packages.map((item, index): SavarPackage => ({ id: index + 1, codigo_paquete: item.codigo, consignado: item.consignado, direccion: item.direccion, distrito: item.distrito, estado: 'PENDIENTE' }));
    expect(filterMissing(items, 'jr. dos')).toEqual([items[1]]);
    expect(filterMissing(items, 'VILLA')).toEqual([items[2]]);
  });

  it('presenta estados operativos consistentes', () => {
    expect(statusLabel('LLEGÓ')).toEqual({ tone: 'success', label: 'LLEGÓ' });
    expect(statusLabel('DUPLICADO')).toEqual({ tone: 'warning', label: 'REPETIDO' });
    expect(statusLabel('OTRO_LOTE')).toEqual({ tone: 'info', label: 'OTRO LOTE' });
    expect(statusLabel('desconocido')).toEqual({ tone: 'error', label: 'NO EXISTE' });
  });
});
