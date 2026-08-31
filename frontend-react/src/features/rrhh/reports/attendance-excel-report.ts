import type { Workbook, Worksheet } from 'exceljs';
import type { AttendanceReportInput, AttendanceReportModel } from './attendance-report-model';
import { buildAttendanceReportModel } from './attendance-report-model';

const COLORS = {
  navy: '173F78',
  blue: '2467B3',
  blueLight: 'EAF2FF',
  green: '159A5B',
  greenLight: 'EAF7F0',
  orange: 'E58A16',
  orangeLight: 'FFF4E4',
  red: 'DC4050',
  redLight: 'FDEDEF',
  violet: '7652C8',
  violetLight: 'F1EDFC',
  ink: '17253A',
  text: '40516A',
  muted: '7C899C',
  border: 'DCE4ED',
  header: 'EFF4F9',
  white: 'FFFFFF',
};

type KpiCard = { label: string; value: string | number; context: string; color: string; light: string };

function fill(color: string) {
  return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: color } };
}

function thinBorder(color = COLORS.border) {
  const side = { style: 'thin' as const, color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} h ${remainder} min` : `${remainder} min`;
}

function formatReportDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

function formatGeneratedAt(value: Date) {
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Lima',
  }).format(value);
}

function configureSheet(sheet: Worksheet, tabColor: string, landscape = true) {
  sheet.properties.defaultRowHeight = 19;
  sheet.properties.tabColor = { argb: tabColor };
  sheet.pageSetup = {
    orientation: landscape ? 'landscape' : 'portrait',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter.oddFooter = '&LMyG Express · Reporte generado automáticamente&C&P de &N&R&D &T';
  sheet.views = [{ state: 'normal', showGridLines: false }];
}

function styleRange(sheet: Worksheet, startRow: number, endRow: number, startCol: number, endCol: number, background: string) {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startCol; column <= endCol; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.fill = fill(background);
      cell.border = thinBorder();
    }
  }
}

function addSectionTitle(sheet: Worksheet, row: number, title: string, endColumn: number) {
  sheet.mergeCells(row, 1, row, endColumn);
  const cell = sheet.getCell(row, 1);
  cell.value = title.toLocaleUpperCase('es');
  cell.font = { name: 'Aptos Display', size: 11, bold: true, color: { argb: COLORS.navy } };
  cell.fill = fill(COLORS.header);
  cell.alignment = { vertical: 'middle' };
  cell.border = { bottom: { style: 'medium', color: { argb: COLORS.blue } } };
  sheet.getRow(row).height = 25;
}

function addKpiCard(sheet: Worksheet, startColumn: number, card: KpiCard) {
  const endColumn = startColumn + 2;
  styleRange(sheet, 5, 7, startColumn, endColumn, COLORS.white);
  sheet.mergeCells(5, startColumn, 5, endColumn);
  sheet.mergeCells(6, startColumn, 6, endColumn);
  sheet.mergeCells(7, startColumn, 7, endColumn);
  const label = sheet.getCell(5, startColumn);
  const value = sheet.getCell(6, startColumn);
  const context = sheet.getCell(7, startColumn);
  label.value = card.label.toLocaleUpperCase('es');
  label.font = { name: 'Aptos', size: 9, bold: true, color: { argb: card.color } };
  value.value = card.value;
  value.font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: COLORS.ink } };
  context.value = card.context;
  context.font = { name: 'Aptos', size: 8, color: { argb: COLORS.muted } };
  [label, value, context].forEach(cell => { cell.alignment = { vertical: 'middle', horizontal: 'left' }; });
  sheet.getCell(5, endColumn).fill = fill(card.light);
  sheet.getCell(6, endColumn).fill = fill(card.light);
  sheet.getCell(7, endColumn).fill = fill(card.light);
}

async function loadLogoBase64() {
  try {
    const response = await fetch('/img/logo.png');
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addReportIdentity(workbook: Workbook, sheet: Worksheet, model: AttendanceReportModel, logoBase64: string | null) {
  sheet.getRow(1).height = 25;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 19;
  sheet.mergeCells('A1:B3');
  if (logoBase64) {
    const image = workbook.addImage({ base64: logoBase64, extension: 'png' });
    sheet.addImage(image, { tl: { col: 0.1, row: 0.1 }, ext: { width: 118, height: 58 } });
  } else {
    const brand = sheet.getCell('A1');
    brand.value = 'MyG\nEXPRESS';
    brand.font = { name: 'Aptos Display', size: 20, bold: true, color: { argb: COLORS.ink } };
    brand.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }
  sheet.mergeCells('C1:H1');
  sheet.getCell('C1').value = 'REPORTE EJECUTIVO DE ASISTENCIA';
  sheet.getCell('C1').font = { name: 'Aptos Display', size: 17, bold: true, color: { argb: COLORS.navy } };
  sheet.getCell('C1').alignment = { vertical: 'middle' };
  sheet.mergeCells('C2:H2');
  sheet.getCell('C2').value = `Fecha del reporte: ${formatReportDate(model.reportDate)}`;
  sheet.getCell('C2').font = { name: 'Aptos', size: 9, color: { argb: COLORS.text } };
  sheet.mergeCells('C3:H3');
  sheet.getCell('C3').value = `Alcance: ${model.scopeLabel} · Generado: ${formatGeneratedAt(model.generatedAt)}`;
  sheet.getCell('C3').font = { name: 'Aptos', size: 8, color: { argb: COLORS.muted } };
  sheet.mergeCells('I1:O3');
  sheet.getCell('I1').value = 'Documento analítico generado desde datos operativos de MyG Express. Use los filtros de cada hoja para segmentar la información.';
  sheet.getCell('I1').alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };
  sheet.getCell('I1').font = { name: 'Aptos', size: 8, italic: true, color: { argb: COLORS.muted } };
}

function applyStatusStyle(sheet: Worksheet, row: number, column: number, status: string) {
  const cell = sheet.getCell(row, column);
  const normalized = status.toLocaleLowerCase('es');
  const color = normalized.includes('tardanza') ? COLORS.orange
    : normalized.includes('presente') ? COLORS.green
      : normalized.includes('permiso') ? COLORS.blue
        : normalized.includes('vacaciones') ? COLORS.violet
          : COLORS.red;
  cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: color } };
}

function addSummarySheet(workbook: Workbook, model: AttendanceReportModel, logoBase64: string | null) {
  const sheet = workbook.addWorksheet('Resumen');
  configureSheet(sheet, COLORS.green);
  sheet.columns = [
    { width: 7 }, { width: 14 }, { width: 17 }, { width: 25 }, { width: 20 },
    { width: 18 }, { width: 19 }, { width: 15 }, { width: 15 }, { width: 15 },
    { width: 15 }, { width: 16 }, { width: 15 }, { width: 16 }, { width: 24 },
  ];
  addReportIdentity(workbook, sheet, model, logoBase64);

  const cards: KpiCard[] = [
    { label: 'Empleados', value: model.kpis.employees, context: 'Personal dentro del alcance', color: COLORS.blue, light: COLORS.blueLight },
    { label: 'Con asistencia', value: model.kpis.withAttendance, context: `${Math.round(model.kpis.attendanceRate * 100)}% de cobertura`, color: COLORS.green, light: COLORS.greenLight },
    { label: 'Tardanzas', value: model.kpis.late, context: 'Ingresos fuera de tolerancia', color: COLORS.orange, light: COLORS.orangeLight },
    { label: 'Sin registrar', value: model.kpis.absent, context: `${model.kpis.authorizedAbsence} ausencias autorizadas`, color: COLORS.red, light: COLORS.redLight },
    { label: 'Horas extra', value: formatMinutes(model.kpis.overtimeMinutes), context: 'Tiempo adicional registrado', color: COLORS.violet, light: COLORS.violetLight },
  ];
  cards.forEach((card, index) => addKpiCard(sheet, index * 3 + 1, card));
  sheet.getRow(5).height = 22;
  sheet.getRow(6).height = 30;
  sheet.getRow(7).height = 22;

  addSectionTitle(sheet, 9, `Vista rápida del detalle · ${Math.min(model.detail.length, 12)} de ${model.detail.length} registros`, 15);
  const preview = model.detail.slice(0, 12);
  sheet.addTable({
    name: 'ResumenDetalleAsistencia',
    ref: 'A10',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: ['N°', 'Código', 'DNI', 'Colaborador', 'Cargo', 'Sede', 'Horario', 'Entrada', 'Salida almuerzo', 'Regreso', 'Salida final', 'Estado', 'Tardanza (min)', 'Horas extra (min)', 'Observaciones'].map(name => ({ name })),
    rows: preview.map(item => [item.number, item.employeeCode, item.document, item.employee, item.role, item.site, item.schedule, item.entry, item.lunchOut, item.lunchReturn, item.exit, item.status, item.delayMinutes, item.overtimeMinutes, item.observations]),
  });
  preview.forEach((item, index) => applyStatusStyle(sheet, 11 + index, 12, item.status));
  const analyticsRow = 12 + preview.length;
  addSectionTitle(sheet, analyticsRow, 'Resumen analítico', 15);

  sheet.getCell(analyticsRow + 1, 1).value = 'ESTADO';
  sheet.getCell(analyticsRow + 1, 2).value = 'CANTIDAD';
  sheet.getCell(analyticsRow + 1, 3).value = 'PORCENTAJE';
  sheet.getCell(analyticsRow + 1, 4).value = 'DISTRIBUCIÓN';
  model.statuses.forEach((item, index) => {
    const row = analyticsRow + 2 + index;
    sheet.getCell(row, 1).value = item.status;
    sheet.getCell(row, 2).value = item.count;
    sheet.getCell(row, 3).value = item.percentage;
    sheet.getCell(row, 3).numFmt = '0.0%';
    sheet.getCell(row, 4).value = '■'.repeat(Math.max(1, Math.round(item.percentage * 12)));
    sheet.getCell(row, 4).font = { color: { argb: COLORS.blue }, size: 9 };
  });

  ['SEDE', 'PERSONAL', 'CON ASISTENCIA', 'TARDANZAS', 'SIN REGISTRO', 'ASISTENCIA', 'HORAS EXTRA'].forEach((value, index) => { sheet.getCell(analyticsRow + 1, 6 + index).value = value; });
  model.sites.forEach((item, index) => {
    const row = analyticsRow + 2 + index;
    sheet.getCell(row, 6).value = item.site;
    sheet.getCell(row, 7).value = item.employees;
    sheet.getCell(row, 8).value = item.withAttendance;
    sheet.getCell(row, 9).value = item.late;
    sheet.getCell(row, 10).value = item.absent;
    sheet.getCell(row, 11).value = item.attendanceRate;
    sheet.getCell(row, 11).numFmt = '0.0%';
    sheet.getCell(row, 12).value = formatMinutes(item.overtimeMinutes);
  });
  for (let column = 1; column <= 12; column += 1) {
    const cell = sheet.getCell(analyticsRow + 1, column);
    if (column === 5) continue;
    cell.fill = fill(COLORS.header);
    cell.font = { name: 'Aptos', size: 8, bold: true, color: { argb: COLORS.navy } };
    cell.border = thinBorder();
  }
  sheet.views = [{ state: 'frozen', ySplit: 9, showGridLines: false }];
  sheet.autoFilter = { from: 'A10', to: 'O10' };
  sheet.getColumn(13).numFmt = '0 "min"';
  sheet.getColumn(14).numFmt = '0 "min"';
  return sheet;
}

function addDetailSheet(workbook: Workbook, model: AttendanceReportModel) {
  const sheet = workbook.addWorksheet('Detalle');
  configureSheet(sheet, COLORS.blue);
  sheet.mergeCells('A1:O1');
  sheet.getCell('A1').value = 'DETALLE COMPLETO DE ASISTENCIA';
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: COLORS.navy } };
  sheet.mergeCells('A2:O2');
  sheet.getCell('A2').value = `${formatReportDate(model.reportDate)} · ${model.scopeLabel} · ${model.detail.length} colaboradores`;
  sheet.getCell('A2').font = { name: 'Aptos', size: 9, color: { argb: COLORS.muted } };
  sheet.addTable({
    name: 'DetalleCompletoAsistencia',
    ref: 'A4',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: ['N°', 'Código', 'DNI', 'Colaborador', 'Cargo', 'Sede', 'Horario', 'Entrada', 'Salida almuerzo', 'Regreso', 'Salida final', 'Estado', 'Tardanza (min)', 'Horas extra (min)', 'Observaciones'].map(name => ({ name })),
    rows: model.detail.map(item => [item.number, item.employeeCode, item.document, item.employee, item.role, item.site, item.schedule, item.entry, item.lunchOut, item.lunchReturn, item.exit, item.status, item.delayMinutes, item.overtimeMinutes, item.observations]),
  });
  const widths = [7, 14, 14, 28, 22, 18, 20, 15, 17, 15, 15, 16, 16, 18, 30];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  model.detail.forEach((item, index) => {
    const row = 5 + index;
    applyStatusStyle(sheet, row, 12, item.status);
    if (item.delayMinutes > 0) sheet.getCell(row, 13).font = { bold: true, color: { argb: COLORS.orange } };
    if (item.overtimeMinutes > 0) sheet.getCell(row, 14).font = { bold: true, color: { argb: COLORS.blue } };
  });
  sheet.getColumn(13).numFmt = '0 "min"';
  sheet.getColumn(14).numFmt = '0 "min"';
  sheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 4, showGridLines: false }];
  sheet.autoFilter = { from: 'A4', to: 'O4' };
  return sheet;
}

function addSiteSheet(workbook: Workbook, model: AttendanceReportModel) {
  const sheet = workbook.addWorksheet('Análisis por sede');
  configureSheet(sheet, COLORS.orange);
  sheet.mergeCells('A1:I1');
  sheet.getCell('A1').value = 'RENDIMIENTO DE ASISTENCIA POR SEDE';
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: COLORS.navy } };
  sheet.mergeCells('A2:I2');
  sheet.getCell('A2').value = `${formatReportDate(model.reportDate)} · Las tasas se calculan sobre el personal incluido en cada sede.`;
  sheet.getCell('A2').font = { name: 'Aptos', size: 9, color: { argb: COLORS.muted } };
  sheet.addTable({
    name: 'RendimientoPorSede',
    ref: 'A4',
    headerRow: true,
    totalsRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: [
      { name: 'Sede', totalsRowLabel: 'Total' },
      { name: 'Personal', totalsRowFunction: 'sum' },
      { name: 'Con asistencia', totalsRowFunction: 'sum' },
      { name: 'Puntuales', totalsRowFunction: 'sum' },
      { name: 'Tardanzas', totalsRowFunction: 'sum' },
      { name: 'Sin registrar', totalsRowFunction: 'sum' },
      { name: 'Ausencias autorizadas', totalsRowFunction: 'sum' },
      { name: 'Asistencia (%)', totalsRowFunction: 'average' },
      { name: 'Horas extra (min)', totalsRowFunction: 'sum' },
    ],
    rows: model.sites.map(item => [item.site, item.employees, item.withAttendance, item.onTime, item.late, item.absent, item.authorizedAbsence, item.attendanceRate, item.overtimeMinutes]),
  });
  [24, 14, 18, 14, 14, 18, 22, 18, 19].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getColumn(8).numFmt = '0.0%';
  sheet.getColumn(9).numFmt = '0 "min"';
  model.sites.forEach((item, index) => {
    const row = 5 + index;
    sheet.getCell(row, 8).font = { bold: true, color: { argb: item.attendanceRate >= .9 ? COLORS.green : item.attendanceRate >= .7 ? COLORS.orange : COLORS.red } };
  });
  sheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  return sheet;
}

function addTrendSheet(workbook: Workbook, model: AttendanceReportModel) {
  const sheet = workbook.addWorksheet('Tendencia');
  configureSheet(sheet, COLORS.violet);
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = 'TENDENCIA DE ASISTENCIA';
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: COLORS.navy } };
  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value = 'Serie cronológica utilizada por el resumen ejecutivo.';
  sheet.getCell('A2').font = { name: 'Aptos', size: 9, color: { argb: COLORS.muted } };
  sheet.addTable({
    name: 'TendenciaAsistencia',
    ref: 'A4',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: ['Fecha', 'Personal laborable', 'Con asistencia', 'Tardanzas', 'Ausencias', 'Ausencias autorizadas', 'Asistencia (%)', 'Tardanza (%)'].map(name => ({ name })),
    rows: model.trend.map(item => [item.date, item.working_employees, item.present, item.late, item.absences, item.authorized_absences, item.attendance_rate === null ? null : item.attendance_rate / 100, item.tardiness_rate === null ? null : item.tardiness_rate / 100]),
  });
  [16, 20, 18, 15, 15, 22, 18, 18].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getColumn(7).numFmt = '0.0%';
  sheet.getColumn(8).numFmt = '0.0%';
  sheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  return sheet;
}

function addOvertimeSheet(workbook: Workbook, model: AttendanceReportModel) {
  const sheet = workbook.addWorksheet('Horas extra');
  configureSheet(sheet, COLORS.violet);
  const rows = model.detail.filter(item => item.overtimeMinutes > 0);
  sheet.mergeCells('A1:F1');
  sheet.getCell('A1').value = 'HORAS EXTRA REGISTRADAS';
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: COLORS.navy } };
  sheet.mergeCells('A2:F2');
  sheet.getCell('A2').value = `${rows.length} colaboradores · ${formatMinutes(model.kpis.overtimeMinutes)} acumulados`;
  sheet.getCell('A2').font = { name: 'Aptos', size: 9, color: { argb: COLORS.muted } };
  sheet.addTable({
    name: 'DetalleHorasExtra',
    ref: 'A4',
    headerRow: true,
    totalsRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: [
      { name: 'Código', totalsRowLabel: 'Total' },
      { name: 'Colaborador' },
      { name: 'Sede' },
      { name: 'Cargo' },
      { name: 'Salida final' },
      { name: 'Horas extra (min)', totalsRowFunction: 'sum' },
    ],
    rows: rows.map(item => [item.employeeCode, item.employee, item.site, item.role, item.exit, item.overtimeMinutes]),
  });
  [16, 28, 20, 22, 18, 20].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getColumn(6).numFmt = '0 "min"';
  sheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  return sheet;
}

function addAbsenceSheet(workbook: Workbook, model: AttendanceReportModel) {
  const sheet = workbook.addWorksheet('Ausencias y solicitudes');
  configureSheet(sheet, COLORS.red);
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = 'AUSENCIAS, PERMISOS Y VACACIONES';
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: COLORS.navy } };
  sheet.mergeCells('A2:H2');
  sheet.getCell('A2').value = `${model.requests.length} solicitudes dentro del alcance actual.`;
  sheet.getCell('A2').font = { name: 'Aptos', size: 9, color: { argb: COLORS.muted } };
  sheet.addTable({
    name: 'AusenciasSolicitudes',
    ref: 'A4',
    headerRow: true,
    totalsRow: false,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: ['Tipo', 'Código', 'Colaborador', 'Sede', 'Desde', 'Hasta', 'Estado', 'Motivo'].map(name => ({ name })),
    rows: model.requests.map(item => [item.type, item.code, item.employee, item.site, item.startDate, item.endDate, item.status, item.reason]),
  });
  [22, 15, 28, 20, 15, 15, 17, 40].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  return sheet;
}

function addConfigurationSheet(workbook: Workbook, model: AttendanceReportModel) {
  const sheet = workbook.addWorksheet('Información');
  configureSheet(sheet, COLORS.muted, false);
  sheet.columns = [{ width: 28 }, { width: 55 }];
  sheet.mergeCells('A1:B1');
  sheet.getCell('A1').value = 'INFORMACIÓN DEL REPORTE';
  sheet.getCell('A1').font = { name: 'Aptos Display', size: 16, bold: true, color: { argb: COLORS.navy } };
  const rows = [
    ['Empresa', 'MyG Express'],
    ['Fecha analizada', formatReportDate(model.reportDate)],
    ['Alcance', model.scopeLabel],
    ['Generado', formatGeneratedAt(model.generatedAt)],
    ['Zona horaria', 'America/Lima'],
    ['Origen', 'Módulo de Recursos Humanos'],
    ['Definición: con asistencia', 'Colaboradores en estado Presente o Tardanza.'],
    ['Definición: sin registrar', 'Colaboradores sin marcación o con falta en la fecha consultada.'],
    ['Definición: horas extra', 'Minutos adicionales calculados por la política de horarios vigente.'],
    ['Privacidad', 'Documento interno. Contiene datos personales y debe manejarse según las políticas de la empresa.'],
  ];
  rows.forEach((item, index) => {
    const row = index + 3;
    sheet.getCell(row, 1).value = item[0];
    sheet.getCell(row, 2).value = item[1];
    sheet.getCell(row, 1).font = { name: 'Aptos', size: 9, bold: true, color: { argb: COLORS.navy } };
    sheet.getCell(row, 2).font = { name: 'Aptos', size: 9, color: { argb: COLORS.text } };
    sheet.getCell(row, 1).fill = fill(COLORS.header);
    sheet.getCell(row, 1).border = thinBorder();
    sheet.getCell(row, 2).border = thinBorder();
    sheet.getCell(row, 2).alignment = { wrapText: true, vertical: 'top' };
  });
  return sheet;
}

export async function buildAttendanceWorkbook(input: AttendanceReportInput) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const model = buildAttendanceReportModel(input);
  workbook.creator = 'MyG Express';
  workbook.company = 'MyG Express';
  workbook.subject = 'Reporte ejecutivo de asistencia';
  workbook.title = `Reporte de asistencia ${model.reportDate}`;
  workbook.description = `Reporte generado para ${model.scopeLabel}`;
  workbook.created = model.generatedAt;
  workbook.modified = model.generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;
  const logoBase64 = typeof fetch === 'function' && typeof FileReader !== 'undefined' ? await loadLogoBase64() : null;
  addSummarySheet(workbook, model, logoBase64);
  addDetailSheet(workbook, model);
  addSiteSheet(workbook, model);
  addTrendSheet(workbook, model);
  addOvertimeSheet(workbook, model);
  addAbsenceSheet(workbook, model);
  addConfigurationSheet(workbook, model);
  workbook.views = [{ x: 0, y: 0, width: 24000, height: 14000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];
  return workbook;
}

export async function exportAttendanceWorkbook(input: AttendanceReportInput) {
  const workbook = await buildAttendanceWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Reporte_Asistencia_${input.attendance.date}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
