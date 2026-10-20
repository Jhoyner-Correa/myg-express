import ExcelJS from 'exceljs';
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
    'PIEZAS',
    'PESO (KG)',
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
    const weightVal = item.urbano?.weightKg !== null && item.urbano?.weightKg !== undefined
      ? item.urbano.weightKg.toFixed(2)
      : (item.declared.weightKg !== null ? item.declared.weightKg.toFixed(2) : '—');

    const row = [
      escapeCsvField(item.guide),
      escapeCsvField(item.urbano?.pieces ?? 1),
      escapeCsvField(weightVal),
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

export async function downloadAuditExcel(records: AuditedGuideResult[], filenamePrefix = 'Auditoria_Guias_WYB'): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MyG Express';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Auditoría Urbano', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = [
    { header: 'GUÍA WYB', key: 'guide', width: 18 },
    { header: 'PIEZAS', key: 'pieces', width: 10 },
    { header: 'PESO (KG)', key: 'weightKg', width: 13 },
    { header: 'PROVEEDOR DECLARADO', key: 'provider', width: 26 },
    { header: 'AGENCIA', key: 'agency', width: 18 },
    { header: 'RUTA', key: 'route', width: 14 },
    { header: 'FECHA RUTA', key: 'date', width: 14 },
    { header: 'ESTADO EXCEL', key: 'declaredStatus', width: 16 },
    { header: 'ESTADO REAL URBANO', key: 'urbanoStatus', width: 24 },
    { header: 'DIAGNÓSTICO AUDITORÍA', key: 'diagnostic', width: 38 },
    { header: 'INTENTOS (SALIDAS)', key: 'attempts', width: 18 },
    { header: 'MOTIVOS PREVIOS', key: 'motives', width: 16 },
    { header: 'DISCREPANCIA (FALSA)', key: 'isDiscrepancy', width: 22 },
    { header: 'COSTO DECLARADO', key: 'cost', width: 18 },
    { header: 'RECEPTOR FIRMA', key: 'signature', width: 24 },
    { header: 'RECEPTOR DNI', key: 'dni', width: 15 },
    { header: 'DESTINATARIO', key: 'recipient', width: 26 },
    { header: 'TELÉFONO', key: 'phone', width: 15 },
    { header: 'DIRECCIÓN DESTINO', key: 'address', width: 32 },
    { header: 'LOCALIDAD / DESTINO', key: 'destination', width: 18 },
    { header: 'REMITENTE / CONTRATO', key: 'sender', width: 24 },
    { header: 'AVISO WHATSAPP MYG', key: 'whatsapp', width: 22 },
  ];

  // Estilo de encabezados ejecutivos corporativos
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  });

  for (const item of records) {
    const isDiscrepant = item.audit.isDiscrepancy;
    const isClean = item.audit.classification === 'ENTREGA_DIRECTA';
    const isMotivated = item.audit.classification === 'ENTREGA_CON_MOTIVOS';

    const row = worksheet.addRow({
      guide: item.guide,
      pieces: item.urbano?.pieces ?? 1,
      weightKg: item.urbano?.weightKg !== null && item.urbano?.weightKg !== undefined
        ? item.urbano.weightKg
        : (item.declared.weightKg !== null ? item.declared.weightKg : null),
      provider: item.declared.provider || '—',
      agency: item.declared.agency || '—',
      route: item.declared.route || '—',
      date: item.declared.date || '—',
      declaredStatus: item.declared.status || '—',
      urbanoStatus: item.urbano?.status || (item.found ? 'Sin estado' : 'NO REGISTRADA'),
      diagnostic: item.audit.summaryText,
      attempts: item.audit.attempts,
      motives: item.audit.motives,
      isDiscrepancy: isDiscrepant ? 'SÍ (FALSA ENTREGA)' : 'NO',
      cost: item.declared.cost !== null ? item.declared.cost : null,
      signature: item.audit.recipientSignature || '—',
      dni: item.audit.recipientDni || '—',
      recipient: item.urbano?.recipient || '—',
      phone: item.urbano?.phone || '—',
      address: item.urbano?.address || '—',
      destination: item.urbano?.destination || '—',
      sender: item.urbano?.sender || item.urbano?.contract || '—',
      whatsapp: item.localNotice ? `${item.localNotice.estadoAviso} (${item.localNotice.fechaEnvio || 'En cola'})` : 'No registrado',
    });

    row.height = 22;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Arial', size: 9.5 };
      cell.alignment = { vertical: 'middle' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (colNumber === 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.font = { name: 'Arial', size: 9.5, bold: true };
      }

      if (colNumber === 3) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00';
        }
      }

      if (colNumber === 14 && typeof cell.value === 'number') {
        cell.numFmt = '"S/" #,##0.00';
      }

      if (isDiscrepant) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF1F2' },
        };
      } else if (isClean) {
        if (colNumber === 9 || colNumber === 10) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0FDF4' },
          };
        }
      } else if (isMotivated) {
        if (colNumber === 10 || colNumber === 12) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFBEB' },
          };
        }
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);

  anchor.href = url;
  anchor.download = `${filenamePrefix}_${dateStr}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
