import type { ImportedPackage, SavarLot, SavarPackage, ZoneTree } from './types';

export const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

function normalizeHeading(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
}

export function getColumnValue(row: Record<string, unknown>, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeHeading);
  const key = Object.keys(row).find(candidate => {
    const normalized = normalizeHeading(candidate);
    return normalizedAliases.some(alias => normalized.includes(alias));
  });
  return key ? String(row[key] ?? '').trim() : '';
}

export function mapSpreadsheetRows(rows: Record<string, unknown>[]): ImportedPackage[] {
  return rows.map(row => ({
    codigo: getColumnValue(row, ['codigo', 'code', 'cod', 'codigo_paquete', 'paquete']),
    consignado: getColumnValue(row, ['consignado', 'nombre', 'cliente', 'name', 'destinatario']),
    direccion: getColumnValue(row, ['direccion', 'address', 'dir', 'domicilio']),
    telefono: getColumnValue(row, ['telefono', 'celular', 'cel', 'phone', 'numero']),
    departamento: getColumnValue(row, ['departamento', 'dpto', 'dept', 'region']),
    provincia: getColumnValue(row, ['provincia', 'prov', 'ciudad']),
    distrito: getColumnValue(row, ['distrito', 'dist', 'zona']),
  })).filter(item => item.codigo.length > 0 && item.consignado.length > 0);
}

export function zoneKey(province?: string, district?: string) {
  const { province: safeProvince, district: safeDistrict } = normalizeZone(province, district);
  return `${safeProvince} - ${safeDistrict}`;
}

function normalizeZone(province?: string, district?: string) {
  return {
    province: String(province || 'SIN PROVINCIA').trim().toUpperCase(),
    district: String(district || 'SIN DISTRITO').trim().toUpperCase(),
  };
}

export function buildZoneTree(rows: ImportedPackage[]): ZoneTree {
  return rows.reduce<ZoneTree>((tree, item) => {
    const { province, district } = normalizeZone(item.provincia, item.distrito);
    const branch = tree[province] ?? { total: 0, districts: {} };
    branch.total += 1;
    branch.districts[district] = (branch.districts[district] ?? 0) + 1;
    tree[province] = branch;
    return tree;
  }, {});
}

export function filterZoneTree(tree: ZoneTree, query: string): ZoneTree {
  const search = query.trim().toUpperCase();
  if (!search) return tree;
  return Object.entries(tree).reduce<ZoneTree>((result, [province, data]) => {
    const provinceMatches = province.includes(search);
    const districts = Object.fromEntries(
      Object.entries(data.districts).filter(([district]) => provinceMatches || district.includes(search)),
    );
    if (Object.keys(districts).length) {
      result[province] = { total: Object.values(districts).reduce((sum, count) => sum + count, 0), districts };
    }
    return result;
  }, {});
}

export function filterPackagesByZones(rows: ImportedPackage[], selected: Set<string>) {
  return rows.filter(item => selected.has(zoneKey(item.provincia, item.distrito)));
}

export function lotProgress(lot?: SavarLot | null) {
  if (!lot?.total) return 0;
  return Math.min(100, Math.max(0, Math.round((Number(lot.recibidos || 0) / Number(lot.total)) * 100)));
}

export function monthKey(date: string) {
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : `${parsed.getMonth() + 1}/${parsed.getFullYear()}`;
}

export function filterLots(lots: SavarLot[], query: string, month: string) {
  const search = query.trim().toLocaleLowerCase('es');
  return lots.filter(lot => (!search || lot.nombre.toLocaleLowerCase('es').includes(search))
    && (!month || monthKey(lot.fecha_creacion) === month));
}

export function filterMissing(items: SavarPackage[], query: string) {
  const search = query.trim().toLocaleLowerCase('es');
  if (!search) return items;
  return items.filter(item => [item.codigo_paquete, item.consignado, item.nombre, item.direccion, item.distrito]
    .some(value => String(value || '').toLocaleLowerCase('es').includes(search)));
}

export function statusLabel(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === 'LLEGÓ') return { tone: 'success', label: 'LLEGÓ' } as const;
  if (['DUPLICADO', 'REPETIDO'].includes(normalized)) return { tone: 'warning', label: 'REPETIDO' } as const;
  if (normalized === 'OTRO_LOTE') return { tone: 'info', label: 'OTRO LOTE' } as const;
  return { tone: 'error', label: 'NO EXISTE' } as const;
}
