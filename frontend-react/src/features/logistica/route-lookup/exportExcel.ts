import { displayText, formatGuide, formatLocality, formatPhone } from './domain';
import type { UrbanoRecord } from './types';

function safeCell(value: unknown): string {
  const text = displayText(value);
  return /^[=+\-@]/.test(text.trimStart()) ? `'${text}` : text;
}

export function buildExportRows(records: UrbanoRecord[]) {
  return records.map(item => ({
    'Ruta ID': safeCell(item.routeId),
    Guia: safeCell(formatGuide(item.guia)),
    Rastreo: safeCell(item.rastreo),
    Cliente: safeCell(item.cliente),
    Telefono: safeCell(formatPhone(item.telefono)),
    Contrato: safeCell(item.contrato),
    Localidad: safeCell(formatLocality(item.localidad)),
  }));
}

export async function downloadRouteExcel(routeId: string, records: UrbanoRecord[]) {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(buildExportRows(records));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ruta');
  XLSX.writeFile(workbook, `ruta_${normalizeFilename(routeId)}.xlsx`);
}

function normalizeFilename(value: string): string {
  return String(value || 'consulta').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'consulta';
}
