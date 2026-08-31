import { MONTHS_ES } from './domain';
import type { ExportStatus, SavarLot, SavarPackage } from './types';

function safeFileName(value: string) {
  return value.trim().replace(/[\s/\\:]+/g, '_').replace(/[^a-zA-Z0-9_áéíóúÁÉÍÓÚñÑ-]/g, '');
}

export async function readSpreadsheet(file: File) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo Excel no contiene hojas.');
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('No se pudo leer la primera hoja del Excel.');
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
}

export async function exportPackageList(items: SavarPackage[], lot: string, status: ExportStatus) {
  const XLSX = await import('xlsx');
  const rows = items.map((item, index) => status === 'LLEGÓ' ? {
    'N°': index + 1,
    Código: item.codigo_paquete,
    Consignado: item.consignado || item.nombre || '',
    Dirección: item.direccion || '',
    Teléfono: item.telefono || '',
    Departamento: item.departamento || '',
    Provincia: item.provincia || '',
    Distrito: item.distrito || '',
    'Lote Carga': item.lote_importacion || lot,
    'Fecha Escaneo': item.fecha_escaneo ? new Date(item.fecha_escaneo).toLocaleString('es-PE') : '',
  } : {
    'N°': index + 1,
    'Código Faltante': item.codigo_paquete,
    Consignado: item.consignado || item.nombre || '',
    Dirección: item.direccion || '',
    Teléfono: item.telefono || '',
    Distrito: item.distrito || '',
    Estado: 'PENDIENTE (NO LLEGÓ)',
  });
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, status === 'LLEGÓ' ? 'Recibidos' : 'Faltantes');
  XLSX.writeFile(workbook, `savar_${status === 'LLEGÓ' ? 'recibidos' : 'faltantes'}_${safeFileName(lot)}.xlsx`);
}

export async function exportLotsSummary(lots: SavarLot[], month: string) {
  const XLSX = await import('xlsx');
  let total = 0;
  let received = 0;
  const rows = lots.map(lot => {
    total += Number(lot.total || 0);
    received += Number(lot.recibidos || 0);
    return {
      'Lote / Carga': lot.nombre,
      'Fecha Carga': lot.fecha_creacion ? new Date(lot.fecha_creacion).toLocaleDateString('es-PE') : '—',
      'Total Paquetes': lot.total,
      'Recibidos (LLEGÓ)': lot.recibidos,
      'Faltantes (PENDIENTE)': Math.max(0, lot.total - lot.recibidos),
      'Efectividad (%)': `${lot.total > 0 ? Math.round((lot.recibidos / lot.total) * 100) : 0}%`,
    };
  });
  rows.push({
    'Lote / Carga': 'TOTAL CONSOLIDADO', 'Fecha Carga': '—', 'Total Paquetes': total,
    'Recibidos (LLEGÓ)': received, 'Faltantes (PENDIENTE)': Math.max(0, total - received),
    'Efectividad (%)': total ? `${Math.round((received / total) * 100)}%` : '0%',
  });
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Resumen Mensual Cargas');
  const [monthNumber, year] = month.split('/');
  const period = month ? `${MONTHS_ES[Number(monthNumber) - 1]}_${year}`.toLowerCase() : 'global';
  XLSX.writeFile(workbook, `consolidado_cargas_savar_${period}.xlsx`);
}
