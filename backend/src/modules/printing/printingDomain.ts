export type PackageLabel = { sequence: string; recipient: string; phone: string };
export type LabelDesign = {
  brand: string; subtitle: string; fontFamily: 'ARIAL' | 'VERDANA' | 'GEORGIA';
  recipientSize: number; phoneSize: number; daySize: number; density: number; showSequenceCircle: boolean;
};
export const DEFAULT_LABEL_DESIGN: LabelDesign = { brand: 'MyG', subtitle: 'EXPRESS', fontFamily: 'ARIAL', recipientSize: 22, phoneSize: 43, daySize: 19, density: 7, showSequenceCircle: true };
export type PrintJobInput = { siteId: number; reference: string; dispatchDay: string; labels: PackageLabel[]; design: LabelDesign; copies: number; idempotencyKey: string };

export class PrintingValidationError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = 'PrintingValidationError'; }
}

function compactText(value: unknown, label: string, maximum: number): string {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new PrintingValidationError(`${label} es obligatorio.`);
  if (text.length > maximum) throw new PrintingValidationError(`${label} admite hasta ${maximum} caracteres.`);
  return text;
}
function positiveInteger(value: unknown, label: string, maximum: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0 || number > maximum) throw new PrintingValidationError(`${label} debe ser un entero entre 1 y ${maximum}.`);
  return number;
}
const VALID_DAYS = new Map([
  ['LUNES', 'LUNES'], ['MARTES', 'MARTES'], ['MIERCOLES', 'MIERCOLES'], ['JUEVES', 'JUEVES'],
  ['VIERNES', 'VIERNES'], ['SABADO', 'SABADO'], ['DOMINGO', 'DOMINGO'],
]);
function normalizePhone(value: unknown, index: number): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) throw new PrintingValidationError(`El telefono del paquete ${index} debe tener entre 6 y 15 digitos.`);
  return digits;
}
function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number, label: string): number {
  const number = value == null ? fallback : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new PrintingValidationError(`${label} debe estar entre ${minimum} y ${maximum}.`);
  return number;
}
function normalizeDesign(value: unknown): LabelDesign {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const fontFamily = String(record.font_family ?? DEFAULT_LABEL_DESIGN.fontFamily).toUpperCase();
  if (!['ARIAL', 'VERDANA', 'GEORGIA'].includes(fontFamily)) throw new PrintingValidationError('La tipografia seleccionada no esta disponible.');
  return {
    brand: compactText(record.brand ?? DEFAULT_LABEL_DESIGN.brand, 'El nombre de marca', 12),
    subtitle: compactText(record.subtitle ?? DEFAULT_LABEL_DESIGN.subtitle, 'El subtitulo de marca', 16).toUpperCase(),
    fontFamily: fontFamily as LabelDesign['fontFamily'],
    recipientSize: boundedNumber(record.recipient_size, 22, 18, 27, 'El tamaño del destinatario'),
    phoneSize: boundedNumber(record.phone_size, 43, 34, 46, 'El tamaño del telefono'),
    daySize: boundedNumber(record.day_size, 19, 14, 22, 'El tamaño del dia'),
    density: boundedNumber(record.density, 7, 3, 12, 'La intensidad de impresion'),
    showSequenceCircle: record.show_sequence_circle !== false,
  };
}

export function normalizePrintJobInput(raw: Record<string, unknown>): PrintJobInput {
  const siteId = positiveInteger(raw.site_id, 'La sede', 2_147_483_647);
  const reference = compactText(raw.reference || 'Etiquetas de paquetes', 'La referencia', 120);
  const copies = raw.copies == null ? 1 : positiveInteger(raw.copies, 'Las copias', 10);
  const rawDay = toPrinterAscii(compactText(raw.dispatch_day, 'El dia de reparto', 12)).toUpperCase();
  const dispatchDay = VALID_DAYS.get(rawDay);
  if (!dispatchDay) throw new PrintingValidationError('Selecciona un dia de reparto valido.');
  const idempotencyKey = String(raw.idempotency_key ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(idempotencyKey)) throw new PrintingValidationError('La solicitud de impresion no tiene un identificador valido.');
  if (!Array.isArray(raw.labels) || raw.labels.length < 1 || raw.labels.length > 100) throw new PrintingValidationError('Incluye entre 1 y 100 paquetes por trabajo.');
  const labels = raw.labels.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new PrintingValidationError(`El paquete ${index + 1} no es valido.`);
    const record = item as Record<string, unknown>;
    return {
      sequence: compactText(record.sequence, `El correlativo del paquete ${index + 1}`, 6),
      recipient: compactText(record.recipient, `El destinatario del paquete ${index + 1}`, 80),
      phone: normalizePhone(record.phone, index + 1),
    };
  });
  return { siteId, reference, dispatchDay, labels, design: normalizeDesign(raw.design), copies, idempotencyKey };
}

export function toPrinterAscii(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/["\\\r\n]/g, ' ').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
}
export function wrapPrinterText(value: string, width = 25): string[] {
  const text = toPrinterAscii(value).toUpperCase();
  if (!text) return [];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length > width) {
    let cut = remaining.lastIndexOf(' ', width);
    if (cut < Math.floor(width * .55)) cut = width;
    lines.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) lines.push(remaining);
  return lines;
}
export function formatPackagePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return digits.replace(/(.{3})/g, '$1 ').trim();
}
function escapeSvg(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function renderLabelBitmap(label: PackageLabel, day: string, design: LabelDesign): Promise<Buffer> {
  const lines = wrapPrinterText(label.recipient, 21).slice(0, 2);
  const nameSize = Math.min(design.recipientSize, lines.some(line => line.length > 18) ? 21 : design.recipientSize);
  const family = design.fontFamily === 'GEORGIA' ? 'Georgia,serif' : design.fontFamily === 'VERDANA' ? 'Verdana,Arial,sans-serif' : 'Arial,sans-serif';
  const circle = design.showSequenceCircle ? `<circle cx="39" cy="35" r="24" fill="none" stroke="black" stroke-width="3"/>` : '';
  const nameMarkup = lines.map((line, index) => `<text x="28" y="${122 + index * 35}" class="name">${escapeSvg(line)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="304" viewBox="0 0 400 304">
    <rect width="400" height="304" fill="white"/>
    ${circle}<text x="39" y="43" text-anchor="middle" font-family="${family}" font-size="22" font-weight="700">${escapeSvg(toPrinterAscii(label.sequence))}</text>
    <text x="198" y="46" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="47" font-weight="900" letter-spacing="-4">${escapeSvg(toPrinterAscii(design.brand))}</text>
    <text x="198" y="70" text-anchor="middle" font-family="${family}" font-size="15" font-weight="800" letter-spacing="4">${escapeSvg(toPrinterAscii(design.subtitle))}</text>
    <rect x="18" y="87" width="334" height="88" rx="2" fill="black"/>
    <style>.name{font-family:${family};font-size:${nameSize}px;font-weight:800;fill:white;letter-spacing:.3px}</style>${nameMarkup}
    <text x="23" y="238" font-family="${family}" font-size="${design.phoneSize}" font-weight="900">${escapeSvg(formatPackagePhone(label.phone))}</text>
    <text x="383" y="152" transform="rotate(-90 383 152)" text-anchor="middle" font-family="${family}" font-size="${design.daySize}" font-weight="800" letter-spacing="1">${day}</text>
  </svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: '#fff' }).greyscale().threshold(170).raw().toBuffer({ resolveWithObject: true });
  const widthBytes = Math.ceil(info.width / 8);
  const bitmap = Buffer.alloc(widthBytes * info.height);
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    // La LUXUR 58F interpreta el bit 0 como punto negro y el bit 1 como blanco.
    if (data[y * info.width + x] >= 128) bitmap[y * widthBytes + Math.floor(x / 8)] |= 0x80 >> (x % 8);
  }
  return bitmap;
}

export async function buildPackageLabelsTspl(labels: readonly PackageLabel[], dispatchDay: string, copies = 1, design: LabelDesign = DEFAULT_LABEL_DESIGN) {
  if (!Number.isInteger(copies) || copies < 1 || copies > 10) throw new PrintingValidationError('Las copias deben estar entre 1 y 10.');
  if (labels.length < 1 || labels.length > 100) throw new PrintingValidationError('Incluye entre 1 y 100 paquetes por trabajo.');
  const day = VALID_DAYS.get(toPrinterAscii(dispatchDay).toUpperCase());
  if (!day) throw new PrintingValidationError('Selecciona un dia de reparto valido.');
  const chunks: Buffer[] = [];
  for (const label of labels) {
    const bitmap = await renderLabelBitmap(label, day, design);
    chunks.push(Buffer.from(`SIZE 50 mm, 38 mm\r\nGAP 3 mm, 0 mm\r\nSPEED 3\r\nDENSITY ${design.density}\r\nDIRECTION 1\r\nCLS\r\nBITMAP 0,0,50,304,0,`, 'ascii'));
    chunks.push(bitmap, Buffer.from(`\r\nPRINT 1,${copies}\r\n`, 'ascii'));
  }
  return { payload: `BASE64:${Buffer.concat(chunks).toString('base64')}`, labelCount: labels.length };
}
import sharp from 'sharp';
