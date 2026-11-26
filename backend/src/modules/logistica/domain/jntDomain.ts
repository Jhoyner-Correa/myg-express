import { PDFParse } from 'pdf-parse';

export interface JntPackage {
  pagina: number;
  guia: string;
  consignado: string;
  telefono: string;
  distrito: string;
  provincia: string;
  departamento: string;
  direccion: string;
  codigoRuta: string;
  codigoPostal: string;
  pesoKg: number | null;
  contenido: string;
  piezas: number;
}

export interface JntConsigneeGroup {
  consignado: string;
  telefono: string;
  totalPaquetes: number;
  distrito: string;
  guias: string[];
  paquetes: JntPackage[];
}

export interface JntParseResult {
  totalPaginas: number;
  totalPaquetes: number;
  totalConsignados: number;
  consignadosMultiples: number;
  distritos: Record<string, number>;
  paquetes: JntPackage[];
  consignados: JntConsigneeGroup[];
}

export function cleanJntText(value: unknown, maxLength = 255): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function cleanJntCode(value: unknown, maxLength = 40): string {
  return String(value ?? '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, maxLength);
}

export function cleanJntPhone(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 9 && digits.startsWith('9')) {
    return digits;
  }
  // Try finding a 9-digit sequence starting with 9
  const match = digits.match(/(9\d{8})/);
  return match ? match[1] : (digits.length >= 7 ? digits.slice(-9) : '');
}

export function cleanJntWeight(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/([\d.]+)/);
  if (!match) return null;
  const parsed = parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1000) / 1000 : null;
}

export function parseJntPageText(text: string, pageNum: number): JntPackage | null {
  if (!text || typeof text !== 'string') return null;

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) return null;

  // 1. Guía / Tracking (JPE + digits, usually 12 digits)
  const trackingMatches = text.match(/\bJPE\d{10,14}\b/i);
  const guia = trackingMatches ? trackingMatches[0].toUpperCase() : '';
  if (!guia) return null;

  // 2. Phone (9 digits starting with 9)
  let telefono = '';
  const phoneMatch = text.match(/\b(9\d{8})\b/);
  if (phoneMatch) {
    telefono = phoneMatch[1];
  } else {
    // Check if line 2 is digits
    if (lines[2] && /^\d{7,11}$/.test(lines[2])) {
      telefono = cleanJntPhone(lines[2]);
    }
  }

  // 3. Ubigeo: Destination is District/Province/Department (e.g. Coviriali/SATIPO/JUNIN)
  let distrito = '';
  let provincia = '';
  let departamento = '';
  for (const line of lines) {
    if (
      line.includes('/') &&
      !line.includes('Faucett') &&
      !line.includes('CALLAO') &&
      !line.includes('https:') &&
      !line.includes('http:')
    ) {
      const parts = line.split('/').map(p => p.trim());
      if (parts.length >= 3) {
        distrito = cleanJntText(parts[0], 100);
        provincia = cleanJntText(parts[1], 100);
        departamento = cleanJntText(parts[2], 100);
        break;
      }
    }
  }

  // 4. Internal Route Code (e.g. M02 M02- 188)
  const routeMatch = text.match(/M\d{2}\s+M\d{2}-\s*\d+/);
  const codigoRuta = routeMatch ? routeMatch[0].trim() : '';

  // 5. Weight
  const weightMatch = text.match(/([\d.]+\s*kg)/i);
  const pesoKg = weightMatch ? cleanJntWeight(weightMatch[1]) : null;

  // 6. Postal Code (C.P.)
  const cpMatch = text.match(/\/Tel:\s*(\d+)/i) || text.match(/C\.P:?\s*(\d+)/i);
  const codigoPostal = cpMatch ? cpMatch[1].trim() : '';

  // 7. Consignee (between C.P: and +51... / Valor declarado / Tel:)
  let consignado = '';
  const cpIdx = lines.findIndex(l => /C\.P/i.test(l));
  const endConsigneeIdx = lines.findIndex(
    (l, idx) => idx > cpIdx && (/^\+51/i.test(l) || /Valor declarado/i.test(l) || /^Tel:/i.test(l))
  );
  if (cpIdx !== -1 && endConsigneeIdx !== -1 && endConsigneeIdx > cpIdx + 1) {
    consignado = lines.slice(cpIdx + 1, endConsigneeIdx).join(' ');
  } else {
    // Fallback: look for Nombre: lines
    const nombreIdxs: number[] = [];
    lines.forEach((l, idx) => {
      if (/^Nombre:/i.test(l)) nombreIdxs.push(idx);
    });
    if (nombreIdxs.length >= 2) {
      const secondNombre = nombreIdxs[1];
      if (lines[secondNombre + 1]) {
        consignado = lines[secondNombre + 1];
      }
    }
  }
  consignado = cleanJntText(consignado, 255);

  // 8. Content (mercadería / package description)
  let contenido = '';
  const barcodeIdx = lines.findIndex(l => l === '123456789');
  if (barcodeIdx !== -1 && lines[barcodeIdx + 1] && lines[barcodeIdx + 1] !== '1') {
    contenido = cleanJntText(lines[barcodeIdx + 1], 255);
  } else {
    const contMatch = text.match(/\bCont:\s*([^\n]+)/i);
    if (contMatch) {
      contenido = cleanJntText(contMatch[1], 255);
    }
  }

  // 9. Pieces
  let piezas = 1;
  const piezasIdx = lines.findIndex(l => /^Piezas:/i.test(l));
  if (piezasIdx !== -1 && lines[piezasIdx + 1] && /^\d+$/.test(lines[piezasIdx + 1])) {
    piezas = parseInt(lines[piezasIdx + 1], 10);
  }

  // 10. Address (between CAN... and Comentarios:)
  let direccion = '';
  const canIdx = lines.findIndex(l => /^CAN\d+/i.test(l));
  const comIdx = lines.findIndex(l => /^Comentarios:/i.test(l));
  if (canIdx !== -1 && comIdx !== -1 && comIdx > canIdx + 1) {
    direccion = lines.slice(canIdx + 1, comIdx).join(' ');
  }
  direccion = cleanJntText(direccion, 255);

  return {
    pagina: pageNum,
    guia,
    consignado,
    telefono,
    distrito,
    provincia,
    departamento,
    direccion,
    codigoRuta,
    codigoPostal,
    pesoKg,
    contenido,
    piezas: piezas > 0 ? piezas : 1
  };
}

export function aggregateConsignees(packages: JntPackage[]): JntConsigneeGroup[] {
  const groups = new Map<string, JntConsigneeGroup>();

  for (const pkg of packages) {
    const normName = pkg.consignado.toUpperCase().trim();
    const phone = pkg.telefono || 'SIN_TELEFONO';
    // Key by normalized name and phone
    const key = `${normName}|${phone}`;

    const existing = groups.get(key);
    if (existing) {
      existing.totalPaquetes += 1;
      if (!existing.guias.includes(pkg.guia)) {
        existing.guias.push(pkg.guia);
      }
      existing.paquetes.push(pkg);
    } else {
      groups.set(key, {
        consignado: pkg.consignado,
        telefono: pkg.telefono,
        totalPaquetes: 1,
        distrito: pkg.distrito,
        guias: [pkg.guia],
        paquetes: [pkg]
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    // Multi-package first, then alphabetical
    if (b.totalPaquetes !== a.totalPaquetes) {
      return b.totalPaquetes - a.totalPaquetes;
    }
    return a.consignado.localeCompare(b.consignado);
  });
}

export async function parseJntPdf(buffer: Buffer): Promise<JntParseResult> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ parsePageInfo: true });
    const pages = result.pages || [];
    const packages: JntPackage[] = [];
    const distritos: Record<string, number> = {};

    for (let i = 0; i < pages.length; i++) {
      const pkg = parseJntPageText(pages[i].text, i + 1);
      if (pkg) {
        packages.push(pkg);
        const dist = pkg.distrito || 'DESCONOCIDO';
        distritos[dist] = (distritos[dist] || 0) + 1;
      }
    }

    const consignados = aggregateConsignees(packages);
    const consignadosMultiples = consignados.filter(c => c.totalPaquetes > 1).length;

    return {
      totalPaginas: pages.length,
      totalPaquetes: packages.length,
      totalConsignados: consignados.length,
      consignadosMultiples,
      distritos,
      paquetes: packages,
      consignados
    };
  } finally {
    await parser.destroy();
  }
}
