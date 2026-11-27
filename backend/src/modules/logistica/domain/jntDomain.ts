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
  const match = String(value).replace(',', '.').match(/([\d.]+)/);
  if (!match) return null;
  const parsed = parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1000) / 1000 : null;
}

export function formatSpanishName(name: unknown): string {
  const cleaned = cleanJntText(name, 255);
  if (!cleaned) return '';
  const lowercaseParticles = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en']);
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((word, idx) => {
      if (idx > 0 && lowercaseParticles.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function formatDistrictName(name: unknown): string {
  const cleaned = cleanJntText(name, 100);
  if (!cleaned) return '';
  const lowercaseParticles = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((word, idx) => {
      if (idx > 0 && lowercaseParticles.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function cleanJntAddress(address: unknown, postalCode = ''): string {
  let cleaned = cleanJntText(address, 255);
  if (postalCode && cleaned.endsWith(postalCode)) {
    cleaned = cleaned.slice(0, -postalCode.length).trim();
  }
  return cleaned
    .replace(/^Nombre:\s*/i, '')
    .replace(/^Direcci[oó]n:\s*/i, '')
    .replace(/\s*Av\.\s*Elmer\s*Faucett.*$/i, '')
    .replace(/\s*Comentarios:.*$/i, '')
    .trim();
}

function isInvalidConsignee(val: string): boolean {
  if (!val || val.length < 3) return true;
  if (/^\d+$/.test(val)) return true;
  if (/Faucett|CALLAO|CAN\d+|123456789|JPE\d+|Comentarios/i.test(val)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(val)) return true;
  return false;
}

export function parseJntPageText(text: string, pageNum: number): JntPackage | null {
  if (!text || typeof text !== 'string') return null;

  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) return null;

  // 1. Guía / Tracking (JPE/JPT/JPR + digits, usually 12 digits)
  const trackingMatches = text.match(/\b(?:JPE|JPT|JPR)\d{10,14}\b/i);
  const guia = trackingMatches ? trackingMatches[0].toUpperCase() : '';
  if (!guia) return null;

  // 2. Phone (9 digits starting with 9)
  let telefono = '';
  const phoneMatch = text.match(/\b(9\d{8})\b/);
  if (phoneMatch) {
    telefono = phoneMatch[1];
  } else {
    const formattedMatch = text.match(/(?:\+?51[\s-]*)?\b(9[\d\s-]{7,12}\d)\b/);
    if (formattedMatch) {
      telefono = cleanJntPhone(formattedMatch[1]);
    } else if (lines[2] && /^\d{7,11}$/.test(lines[2])) {
      telefono = cleanJntPhone(lines[2]);
    }
  }

  // 3. Ubigeo: Destination is District/Province/Department (e.g. Coviriali/SATIPO/JUNIN o Oxapampa/OXAPAMPA/PASCO)
  let distrito = '';
  let provincia = '';
  let departamento = '';
  for (const line of lines) {
    if (
      line.includes('/') &&
      !line.includes('Faucett') &&
      !line.includes('CALLAO') &&
      !line.includes('https:') &&
      !line.includes('http:') &&
      !line.includes('C.P:') &&
      !/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)
    ) {
      const parts = line.split('/').map(p => p.trim());
      if (
        parts.length >= 3 &&
        /[a-zA-Z]/.test(parts[0]) &&
        !/^\d+$/.test(parts[0]) &&
        /[a-zA-Z]/.test(parts[1]) &&
        !/^\d+$/.test(parts[1])
      ) {
        distrito = formatDistrictName(parts[0]);
        provincia = cleanJntText(parts[1].toUpperCase(), 100);
        departamento = cleanJntText(parts[2].toUpperCase(), 100);
        break;
      }
    }
  }

  // Fallback for district: Destination header before 'Firma'
  if (!distrito) {
    const firmaHeaderIdx = lines.findIndex(l => /Firma/i.test(l));
    if (
      firmaHeaderIdx > 0 &&
      /^[A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,30}$/.test(lines[firmaHeaderIdx - 1]) &&
      !/Piezas|Valor|declarado|kg|Peso/i.test(lines[firmaHeaderIdx - 1])
    ) {
      distrito = formatDistrictName(lines[firmaHeaderIdx - 1]);
    }
  }

  // 4. Internal Route Code (e.g. M02 M02- 188 o M02 M11-)
  const routeMatch = text.match(/M\d{2}\s+M\d{2}-\s*\d*/);
  const codigoRuta = routeMatch ? routeMatch[0].trim() : '';

  // 5. Weight
  const weightMatch = text.match(/([\d.,]+\s*kg)/i) || text.match(/Peso:\s*([\d.,]+)/i);
  const pesoKg = weightMatch ? cleanJntWeight(weightMatch[1]) : null;

  // 6. Postal Code (C.P.)
  let codigoPostal = '';
  const cpMatch = text.match(/\/Tel:\s*(\d+)/i) || text.match(/C\.P:?\s*(\d+)/i);
  if (cpMatch) {
    codigoPostal = cpMatch[1].trim();
  }

  // 7. Pieces
  let piezas = 1;
  const piezasIdx = lines.findIndex(l => /^Piezas:/i.test(l));
  if (piezasIdx !== -1) {
    if (lines[piezasIdx + 1] && /^\d{1,3}$/.test(lines[piezasIdx + 1])) {
      const p = parseInt(lines[piezasIdx + 1], 10);
      if (p > 0 && p <= 100) piezas = p;
    } else if (piezasIdx > 0 && /^\d{1,3}$/.test(lines[piezasIdx - 1])) {
      const p = parseInt(lines[piezasIdx - 1], 10);
      if (p > 0 && p <= 100) piezas = p;
    }
  }

  // 8. Consignee & Address (Supports multiple J&T label layouts)
  let consignado = '';
  let direccion = '';

  // Layout B (Receipt Header -> Date -> Recipient Name -> Nombre: -> Recipient Address -> CP / Faucett)
  const firmaIdx = lines.findIndex(l => /Firma(?:\s+de\s+(?:recepci[oó]n|entrega))?:/i.test(l));
  const recipientNombreIdx = lines.findIndex((l, idx) => {
    if (idx <= firmaIdx) return false;
    if (/^Nombre:\s*CAN\d+/i.test(l)) return false;
    return /Nombre:/i.test(l);
  });

  if (firmaIdx !== -1 && recipientNombreIdx !== -1 && (recipientNombreIdx - firmaIdx) <= 6) {
    const candidateLines = lines.slice(firmaIdx + 1, recipientNombreIdx);
    const isInvalidCandidate = candidateLines.some(l =>
      /Faucett|CALLAO|JPE\d+/i.test(l) || (/^\d+$/.test(l) && !/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l))
    );

    if (!isInvalidCandidate) {
      const nombreLine = lines[recipientNombreIdx];
      let candidateName = '';
      if (/^(.+?)\s*[\t ]+Nombre:$/i.test(nombreLine)) {
        const m = nombreLine.match(/^(.+?)\s*[\t ]+Nombre:$/i);
        candidateName = m ? m[1].trim() : '';
      } else {
        let startIdx = firmaIdx + 1;
        if (lines[startIdx] && /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(lines[startIdx])) {
          startIdx++;
        }
        if (recipientNombreIdx > startIdx) {
          candidateName = lines.slice(startIdx, recipientNombreIdx).join(' ');
        }
      }

      if (!isInvalidConsignee(candidateName)) {
        consignado = formatSpanishName(candidateName);
      }

      // Recipient address in Layout B
      const addrEndIdx = lines.findIndex((l, idx) => {
        if (idx <= recipientNombreIdx) return false;
        return /^\d{5,6}$/.test(l) || /Faucett/i.test(l) || /^Cont:/i.test(l) || /^C\.P/i.test(l);
      });
      if (addrEndIdx !== -1 && addrEndIdx > recipientNombreIdx + 1) {
        direccion = cleanJntAddress(lines.slice(recipientNombreIdx + 1, addrEndIdx).join(' '), lines[addrEndIdx]);
        if (!codigoPostal && /^\d{5,6}$/.test(lines[addrEndIdx])) {
          codigoPostal = lines[addrEndIdx];
        }
      }
    }
  }

  // Layout A Fallback for Consignee (between C.P: and +51... / Valor declarado / Tel:)
  if (!consignado) {
    const cpIdx = lines.findIndex(l => /^C\.P/i.test(l));
    const endConsigneeIdx = lines.findIndex(
      (l, idx) => idx > cpIdx && (/^\+51/i.test(l) || /Valor declarado/i.test(l) || /^Tel:/i.test(l))
    );
    if (cpIdx !== -1 && endConsigneeIdx !== -1 && endConsigneeIdx > cpIdx + 1) {
      const candidateName = lines.slice(cpIdx + 1, endConsigneeIdx).join(' ');
      if (!isInvalidConsignee(candidateName)) {
        consignado = formatSpanishName(candidateName);
      }
    } else {
      // Fallback: look for Nombre: lines
      const nombreIdxs: number[] = [];
      lines.forEach((l, idx) => {
        if (/^Nombre:/i.test(l)) nombreIdxs.push(idx);
      });
      if (nombreIdxs.length >= 2) {
        const secondNombre = nombreIdxs[1];
        if (lines[secondNombre + 1] && !isInvalidConsignee(lines[secondNombre + 1])) {
          consignado = formatSpanishName(lines[secondNombre + 1]);
        }
      }
    }
  }

  // Layout A Fallback for Address (between CAN... and Comentarios:)
  if (!direccion) {
    const canIdx = lines.findIndex(l => /^CAN\d+/i.test(l));
    const comIdx = lines.findIndex(l => /^Comentarios:/i.test(l));
    if (canIdx !== -1 && comIdx !== -1 && comIdx > canIdx + 1) {
      direccion = cleanJntAddress(lines.slice(canIdx + 1, comIdx).join(' '));
    }
  }

  consignado = cleanJntText(consignado, 255);
  direccion = cleanJntText(direccion, 255);

  // 9. Content (mercadería / package description)
  let contenido = '';
  const contIdx = lines.findIndex(l => /^Cont:?$/i.test(l));
  if (
    contIdx !== -1 &&
    lines[contIdx + 1] &&
    !lines[contIdx + 1].startsWith('+') &&
    !lines[contIdx + 1].startsWith('Peso') &&
    !/^CAN\d+/i.test(lines[contIdx + 1])
  ) {
    contenido = cleanJntText(lines[contIdx + 1], 255);
  } else {
    const barcodeIdx = lines.findIndex(l => l === '123456789');
    if (barcodeIdx !== -1 && lines[barcodeIdx + 1] && lines[barcodeIdx + 1] !== '1') {
      contenido = cleanJntText(lines[barcodeIdx + 1], 255);
    } else {
      const contMatch = text.match(/\bCont:\s*([^\n]+)/i);
      if (contMatch) {
        contenido = cleanJntText(contMatch[1], 255);
      }
    }
  }

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

export function extractDateFromJntFilename(filename: string): string | null {
  const isoCompact = filename.match(/(?:^|[_-])(20\d{2})([01]\d)([0-3]\d)(?:[_.-]|$)/);
  if (isoCompact) {
    return `${isoCompact[3]}-${isoCompact[2]}-${isoCompact[1]}`;
  }
  const dmy = filename.match(/(?:^|[_-])([0-3]\d)[-_]([01]\d)[-_](20\d{2})(?:[_.-]|$)/);
  if (dmy) {
    return `${dmy[1]}-${dmy[2]}-${dmy[3]}`;
  }
  return null;
}

export function isMachineJntFilename(filename: string): boolean {
  const base = filename.replace(/\.pdf$/i, '').trim();
  return /downloadCenter|jmsmx|multiple-api|ops-multiple|_\d{10,}$/i.test(base) ||
    /^[a-z0-9]{12,}_/i.test(base);
}

export function buildProfessionalJntBatchName(options: {
  originalFilename: string;
  customName?: unknown;
  distritos: Record<string, number>;
  totalPaquetes: number;
  fallbackIsoDate: string;
}): string {
  const custom = cleanJntText(options.customName, 180).replace(/\.pdf$/i, '').trim();
  if (custom) {
    return custom;
  }

  const original = String(options.originalFilename || '').trim();
  if (original && !isMachineJntFilename(original)) {
    const cleaned = cleanJntText(
      original.replace(/\.pdf$/i, '').replace(/[_]+/g, ' '),
      180
    );
    if (cleaned) return cleaned;
  }

  const extractedDate = extractDateFromJntFilename(original);
  const [y = '', m = '', d = ''] = String(options.fallbackIsoDate || '').split('-');
  const displayDate = extractedDate || (y && m && d ? `${d}-${m}-${y}` : options.fallbackIsoDate);

  const topDistricts = Object.entries(options.distritos || {})
    .filter(([name]) => name && name.toUpperCase() !== 'DESCONOCIDO')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);

  const zoneText = topDistricts.length > 0 ? topDistricts.join(' / ') : 'General';
  return cleanJntText(`J&T · ${displayDate} · ${zoneText} (${options.totalPaquetes} guías)`, 180);
}
