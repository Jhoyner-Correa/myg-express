import type { UrbanoDispatchGuide, UrbanoDispatchResult } from './types';

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function downloadDispatchCsv(result: UrbanoDispatchResult, records: UrbanoDispatchGuide[]) {
  const headers = [
    'Guía', 'Rastreo', 'Destinatario', 'Teléfono', 'Destino', 'Dirección',
    'Estado', 'Cliente', 'Servicio', 'Manifiesto', 'Piezas', 'Peso kg', 'Fecha',
  ];
  const rows = records.map((record) => [
    record.guide,
    record.tracking,
    record.recipient,
    record.phone,
    record.destination,
    record.address,
    record.status,
    record.customer,
    record.service,
    record.manifest,
    record.pieces,
    record.weightKg,
    record.registeredAt,
  ]);
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `despacho-urbano-${result.dispatchId}-pagina-${result.page}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
