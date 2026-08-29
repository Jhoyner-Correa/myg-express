import type { Employee } from '../types';

export type PersonnelExportFormat = 'xlsx' | 'csv' | 'json' | 'pdf';

const trackingLabel = {
  NINGUNO: 'Sin rastreo',
  SOLO_MARCACION: 'Solo marcación',
  CONTINUO: 'Continuo',
} as const;

const statusLabel = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  SUSPENDIDO: 'Suspendido',
} as const;

const columns = [
  'Código', 'Colaborador', 'Sede', 'Documento', 'RUC', 'Cargo', 'Seguimiento',
  'Estado', 'Acceso móvil', 'Correo', 'Teléfono', 'Dirección', 'Fecha de ingreso',
] as const;

function reportRows(employees: Employee[]): string[][] {
  return employees.map(employee => [
    employee.codigoEmpleado,
    `${employee.nombres} ${employee.apellidos}`,
    employee.sedeNombre ?? 'Sin sede',
    employee.dni,
    employee.ruc ?? '',
    employee.cargoNombre ?? 'Sin cargo',
    trackingLabel[employee.tipoRastreo],
    statusLabel[employee.estado],
    employee.accesoMovilActivo ? 'Habilitado' : 'Sin activar',
    employee.email ?? '',
    employee.telefono ?? '',
    employee.direccion,
    employee.fechaIngreso,
  ]);
}

function fileDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function exportCsv(employees: Employee[]): void {
  const csv = `\uFEFF${[columns, ...reportRows(employees)].map(row => row.map(csvCell).join(';')).join('\r\n')}`;
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `Directorio_Personal_${fileDate()}.csv`);
}

function exportJson(employees: Employee[]): void {
  const records = reportRows(employees).map(values => Object.fromEntries(columns.map((column, index) => [column, values[index]])));
  const payload = {
    reporte: 'Directorio de personal',
    generado_en: new Date().toISOString(),
    total_colaboradores: records.length,
    colaboradores: records,
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), `Directorio_Personal_${fileDate()}.json`);
}

async function exportExcel(employees: Employee[]): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MyG Express';
  workbook.company = 'MyG Express';
  workbook.title = 'Directorio corporativo de personal';
  workbook.subject = 'Recursos Humanos';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Personal', {
    views: [{ state: 'frozen', ySplit: 5, activeCell: 'A6' }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  sheet.columns = [14, 30, 19, 15, 16, 24, 20, 15, 17, 29, 16, 38, 18].map(width => ({ width }));
  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell('A1').value = 'MYG EXPRESS · DIRECTORIO DE PERSONAL';
  sheet.getCell('A1').font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123B67' } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 34;
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.getCell('A2').value = `Generado el ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}`;
  sheet.getCell('A2').font = { name: 'Calibri', size: 10, color: { argb: 'FF52657A' } };
  sheet.mergeCells(3, 1, 3, columns.length);
  sheet.getCell('A3').value = `${employees.length} ${employees.length === 1 ? 'colaborador incluido' : 'colaboradores incluidos'}`;
  sheet.getCell('A3').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1D4F82' } };

  const header = sheet.getRow(5);
  header.values = [...columns];
  header.height = 26;
  header.eachCell(cell => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2165AD' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF174B82' } } };
  });

  reportRows(employees).forEach((values, index) => {
    const row = sheet.addRow(values);
    row.height = 23;
    row.eachCell(cell => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF24384F' } };
      cell.alignment = { vertical: 'middle', wrapText: false };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE5EF' } } };
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F9FC' } };
    });
    const statusCell = row.getCell(8);
    statusCell.font = { ...statusCell.font, bold: true, color: { argb: values[7] === 'Activo' ? 'FF168451' : values[7] === 'Suspendido' ? 'FFC8790A' : 'FF718096' } };
    const accessCell = row.getCell(9);
    accessCell.font = { ...accessCell.font, bold: true, color: { argb: values[8] === 'Habilitado' ? 'FF168451' : 'FF718096' } };
  });

  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, employees.length + 5), column: columns.length } };
  sheet.headerFooter.oddFooter = '&LMyG Express · Recursos Humanos&C&P de &N&RGenerado por el sistema';
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Directorio_Personal_${fileDate()}.xlsx`,
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ?? character);
}

function exportPdf(employees: Employee[]): void {
  const printWindow = window.open('', '_blank', 'width=1280,height=820');
  if (!printWindow) throw new Error('El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes para generar el PDF.');
  printWindow.opener = null;
  const body = reportRows(employees).map(values => `<tr>${values.map(value => `<td>${escapeHtml(value || '—')}</td>`).join('')}</tr>`).join('');
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Directorio de Personal</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#183047;font:10px Arial,sans-serif}header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:18px;padding:15px 18px;background:#123b67;color:#fff}h1{margin:0;font-size:20px}header p{margin:4px 0 0;color:#dbeafe}.total{font-size:13px;font-weight:700}table{width:100%;border-collapse:collapse}th{padding:8px 6px;background:#2165ad;color:#fff;font-size:8px;text-align:left;text-transform:uppercase}td{padding:7px 6px;border-bottom:1px solid #dce5ef;vertical-align:top}tr:nth-child(even){background:#f6f9fc}footer{margin-top:14px;color:#718096;font-size:8px;text-align:right}
  </style></head><body><header><div><h1>MyG Express · Directorio de personal</h1><p>Reporte corporativo de Recursos Humanos · ${escapeHtml(new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeStyle: 'short' }).format(new Date()))}</p></div><div class="total">${employees.length} colaboradores</div></header><table><thead><tr>${columns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table><footer>Generado automáticamente por el sistema MyG Express</footer><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`);
  printWindow.document.close();
}

export async function exportPersonnelDirectory(employees: Employee[], format: PersonnelExportFormat): Promise<void> {
  if (format === 'xlsx') return exportExcel(employees);
  if (format === 'csv') return exportCsv(employees);
  if (format === 'json') return exportJson(employees);
  exportPdf(employees);
}
