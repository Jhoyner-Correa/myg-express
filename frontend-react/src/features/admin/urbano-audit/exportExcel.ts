import type { AuditedGuideResult } from './types';

function escapeCsvField(value: unknown): string {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  if (text.includes(',') || text.includes('"') || text.includes(';')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildAuditCsvRows(records: AuditedGuideResult[]): string {
  const headers = [
    'GUIA WYB',
    'PROVEEDOR DECLARADO',
    'AGENCIA DECLARADA',
    'RUTA DECLARADA',
    'FECHA RUTA DECLARADA',
    'ESTADO DECLARADO EXCEL',
    'ESTADO REAL URBANO',
    'DETALLE ESTADO URBANO',
    'DIAGNOSTICO AUDITORIA',
    'INTENTOS SALIDAS A RUTA',
    'MOTIVOS PREVIOS',
    'ES DISCREPANCIA',
    'RECEPTOR FIRMA',
    'RECEPTOR DNI',
    'DESTINATARIO',
    'TELEFONO',
    'DIRECCION DESTINO',
    'LOCALIDAD',
    'REMITENTE / CONTRATO',
    'FECHA ADMISION',
    'FECHA ENTREGA ESTIMADA',
    'COSTO DECLARADO',
    'AVISO WHATSAPP MYG',
  ];

  const lines = [headers.join(',')];

  for (const item of records) {
    const row = [
      escapeCsvField(item.guide),
      escapeCsvField(item.declared.provider || '—'),
      escapeCsvField(item.declared.agency || '—'),
      escapeCsvField(item.declared.route || '—'),
      escapeCsvField(item.declared.date || '—'),
      escapeCsvField(item.declared.status || '—'),
      escapeCsvField(item.urbano?.status || (item.found ? 'Sin estado' : 'NO REGISTRADA')),
      escapeCsvField(item.urbano?.statusDetail || '—'),
      escapeCsvField(item.audit.summaryText),
      escapeCsvField(item.audit.attempts),
      escapeCsvField(item.audit.motives),
      escapeCsvField(item.audit.isDiscrepancy ? 'SI (FALSA ENTREGA)' : 'NO'),
      escapeCsvField(item.audit.recipientSignature || '—'),
      escapeCsvField(item.audit.recipientDni || '—'),
      escapeCsvField(item.urbano?.recipient || '—'),
      escapeCsvField(item.urbano?.phone || '—'),
      escapeCsvField(item.urbano?.address || '—'),
      escapeCsvField(item.urbano?.destination || '—'),
      escapeCsvField(item.urbano?.sender || item.urbano?.contract || '—'),
      escapeCsvField(item.urbano?.dates.admitted || '—'),
      escapeCsvField(item.urbano?.estimatedDeliveryDate || '—'),
      escapeCsvField(item.declared.cost !== null ? item.declared.cost.toFixed(2) : '—'),
      escapeCsvField(item.localNotice ? `${item.localNotice.estadoAviso} (${item.localNotice.fechaEnvio || 'En cola'})` : 'No registrado'),
    ];

    lines.push(row.join(','));
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export function downloadAuditCsv(records: AuditedGuideResult[], filenamePrefix = 'Auditoria_Guias_WYB'): void {
  const csvContent = buildAuditCsvRows(records);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);

  anchor.href = url;
  anchor.download = `${filenamePrefix}_${dateStr}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
