import { UrbanoGuideDetail } from '../../../services/urbanoService';

export class UrbanoGuideAuditValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrbanoGuideAuditValidationError';
  }
}

export type ParsedAuditRow = {
  guide: string;
  declaredProvider: string | null;
  declaredRoute: string | null;
  declaredDate: string | null;
  declaredStatus: string | null;
  declaredCost: number | null;
  declaredWeightKg: number | null;
  declaredAgency: string | null;
};

export type AuditClassification =
  | 'ENTREGA_DIRECTA'
  | 'ENTREGA_CON_MOTIVOS'
  | 'DISCREPANCIA_NO_ENTREGADO'
  | 'EN_GESTION'
  | 'NO_ENCONTRADO';

export type AuditedGuideResult = {
  guide: string;
  found: boolean;
  declared: {
    provider: string | null;
    route: string | null;
    date: string | null;
    status: string | null;
    cost: number | null;
    weightKg: number | null;
    agency: string | null;
  };
  urbano: {
    guide: string;
    tracking: string;
    recipient: string;
    phone: string;
    destination: string;
    address: string;
    status: string;
    statusDetail: string;
    sender: string;
    service: string;
    contract: string;
    pieces: number | null;
    weightKg: number | null;
    registeredAt: string;
    estimatedDeliveryDate: string;
    dates: {
      pickup: string;
      dispatched: string;
      admitted: string;
      outForDelivery: string;
      deadline: string;
    };
  } | null;
  audit: {
    classification: AuditClassification;
    attempts: number;
    motives: number;
    isDiscrepancy: boolean;
    recipientSignature: string | null;
    recipientDni: string | null;
    summaryText: string;
  };
  localNotice: {
    avisoId: number;
    telefono: string;
    estadoAviso: string;
    fechaEnvio: string | null;
  } | null;
  error?: string;
};

export type AuditSummaryKpi = {
  total: number;
  found: number;
  notFound: number;
  cleanDeliveries: number;
  cleanDeliveriesPct: number;
  motivatedDeliveries: number;
  motivatedDeliveriesPct: number;
  motives1Attempt: number;
  motives2Attempts: number;
  motives3PlusAttempts: number;
  discrepancies: number;
  discrepanciesPct: number;
  inManagement: number;
  inManagementPct: number;
  totalDeclaredCost: number;
  discrepantDeclaredCost: number;
};

export const MAX_AUDIT_BATCH_ROWS = 350;

/**
 * Valida un código de guía Urbano (soporta formatos WYB y ENU).
 */
export function isValidUrbanoGuide(code: unknown): boolean {
  const normalized = String(code ?? '').trim().toUpperCase();
  return /^(?:WYB|ENU)\d{6,20}$/.test(normalized);
}

/**
 * Extrae intentos y cantidad de motivos previos a partir de outForDelivery (fecha_er).
 * Ej: "Vie. 18-9 (3)" -> attempts: 3, motives: 2
 * Ej: "Mie. 30-9 (1)" -> attempts: 1, motives: 0
 * Ej: "PEND" -> attempts: 0, motives: 0
 */
export function parseAttemptsAndMotives(outForDeliveryText: string | null | undefined): { attempts: number; motives: number } {
  const text = String(outForDeliveryText ?? '').trim();
  if (!text || text.toUpperCase() === 'PEND') {
    return { attempts: 0, motives: 0 };
  }

  const match = text.match(/\((\d+)\)/);
  if (match) {
    const attempts = parseInt(match[1], 10);
    const validAttempts = Number.isSafeInteger(attempts) && attempts >= 0 ? attempts : 1;
    return {
      attempts: validAttempts,
      motives: Math.max(0, validAttempts - 1),
    };
  }

  // Si tiene fecha pero no tiene paréntesis de reintento, fue un solo intento
  return { attempts: 1, motives: 0 };
}

/**
 * Extrae nombre del receptor y DNI del campo statusDetail (ej. "Firma:Jeremy Sanchez Valenzuela (DNI:44484630)").
 */
export function parseRecipientSignatureAndDni(statusDetail: string | null | undefined): { signature: string | null; dni: string | null } {
  const detail = String(statusDetail ?? '').trim();
  if (!detail) return { signature: null, dni: null };

  const dniMatch = detail.match(/DNI\s*[:=]?\s*(\d{7,10})/i);
  const dni = dniMatch ? dniMatch[1] : null;

  const sigMatch = detail.match(/Firma\s*[:=]?\s*([^()]+)/i);
  let signature = sigMatch ? sigMatch[1].trim() : null;
  if (!signature && detail && !detail.toUpperCase().includes('CIERRE DE GESTION')) {
    signature = detail.replace(/\(DNI:[^)]+\)/i, '').trim() || null;
  }

  return { signature, dni };
}

/**
 * Clasifica la guía comparando lo declarado en el Excel contra la respuesta de Urbano.
 */
export function classifyGuideAudit(
  detail: UrbanoGuideDetail | null,
  declaredStatus?: string | null,
): { classification: AuditClassification; isDiscrepancy: boolean; summaryText: string; attempts: number; motives: number } {
  if (!detail) {
    return {
      classification: 'NO_ENCONTRADO',
      isDiscrepancy: false,
      summaryText: 'Guía no registrada en Urbano',
      attempts: 0,
      motives: 0,
    };
  }

  const { attempts, motives } = parseAttemptsAndMotives(detail.dates.outForDelivery);
  const normalizedUrbanoStatus = String(detail.status ?? '').trim().toUpperCase();
  const normalizedSubStatus = String(detail.statusDetail ?? '').trim().toUpperCase();
  const declaredNormalized = String(declaredStatus ?? '').trim().toUpperCase();

  const isActuallyDelivered = normalizedUrbanoStatus.includes('ENTREG');
  const isReturnedOrClosed =
    normalizedUrbanoStatus.includes('DEVOLV') ||
    normalizedUrbanoStatus.includes('DEVOLUCI') ||
    normalizedUrbanoStatus.includes('RECHAZ') ||
    normalizedSubStatus.includes('CIERRE DE GESTION');

  const declaredAsDelivered = !declaredNormalized || declaredNormalized.includes('ENTREG');

  // Caso 1: Declarada como Entregada, pero en Urbano figura Devuelta o Cerrada sin entrega
  if (declaredAsDelivered && isReturnedOrClosed) {
    return {
      classification: 'DISCREPANCIA_NO_ENTREGADO',
      isDiscrepancy: true,
      summaryText: `Falsa Entrega: Figura entregada en Excel, pero en Urbano es "${detail.status}"`,
      attempts,
      motives,
    };
  }

  // Caso 2: Declarada como Entregada, pero en Urbano sigue con motivo pendiente
  if (declaredAsDelivered && !isActuallyDelivered && (normalizedUrbanoStatus.includes('MOTIV') || normalizedUrbanoStatus.includes('INCIDENCIA') || normalizedUrbanoStatus.includes('PENDIENTE'))) {
    return {
      classification: 'DISCREPANCIA_NO_ENTREGADO',
      isDiscrepancy: true,
      summaryText: `Discrepancia: Declarada entregada, pero en Urbano sigue "${detail.status}"`,
      attempts,
      motives,
    };
  }

  // Caso 3: Realmente entregada
  if (isActuallyDelivered) {
    if (motives > 0) {
      return {
        classification: 'ENTREGA_CON_MOTIVOS',
        isDiscrepancy: false,
        summaryText: `Entregado con ${motives} motivo(s) previo(s) (${attempts} salidas a ruta)`,
        attempts,
        motives,
      };
    }
    return {
      classification: 'ENTREGA_DIRECTA',
      isDiscrepancy: false,
      summaryText: 'Entrega directa limpia al 1er intento (0 motivos)',
      attempts: 1,
      motives: 0,
    };
  }

  // Caso 4: En gestión / Reparto
  return {
    classification: 'EN_GESTION',
    isDiscrepancy: false,
    summaryText: `En gestión operativa (${detail.status})`,
    attempts,
    motives,
  };
}

/**
 * Parser inteligente de entrada:
 * Acepta listas simples de códigos WYB o filas completas copiadas de Excel (CSV/TSV).
 */
export function parseGuideAuditText(inputText: unknown): ParsedAuditRow[] {
  const text = String(inputText ?? '').trim();
  if (!text) {
    throw new UrbanoGuideAuditValidationError('Ingresa o pega las guías a auditar.');
  }

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) {
    throw new UrbanoGuideAuditValidationError('No se encontraron líneas válidas para auditar.');
  }

  const rows: ParsedAuditRow[] = [];
  const seenGuides = new Set<string>();

  for (const line of lines) {
    // Si la línea es encabezado de Excel (contiene "NOMBRE PROVEEDOR" o "GUIA" o "ESTADO"), ignorar
    if (/NOMBRE\s*PROVEEDOR|NOMBRE\s*AGENCIA|TOTAL\s*GUIA/i.test(line)) {
      continue;
    }

    // Buscar código WYB o ENU en la línea
    const guideMatch = line.match(/\b((?:WYB|ENU)\d{6,20})\b/i);
    if (!guideMatch) {
      continue;
    }

    const guideCode = guideMatch[1].toUpperCase();
    if (seenGuides.has(guideCode)) {
      // Ignorar duplicados dentro del mismo lote
      continue;
    }
    seenGuides.add(guideCode);

    // Separar por tabuladores o comas si es una fila de Excel pegada
    const delimiter = line.includes('\t') ? '\t' : (line.includes(',') ? ',' : null);
    let declaredProvider: string | null = null;
    let declaredRoute: string | null = null;
    let declaredDate: string | null = null;
    let declaredStatus: string | null = null;
    let declaredCost: number | null = null;
    let declaredWeightKg: number | null = null;
    let declaredAgency: string | null = null;

    if (delimiter) {
      const parts = line.split(delimiter).map((p) => p.trim());
      // Buscar índice de la columna que contiene la guía
      const guideIndex = parts.findIndex((p) => p.toUpperCase() === guideCode);

      if (guideIndex >= 0) {
        // En el formato estándar de liquidación Urbano:
        // Col 0: NOMBRE PROVEEDOR (ej. PALOMINO CUBA GARY KIDNER)
        // Col 1: NOMBRE AGENCIA (ej. OXAMPAMPA II)
        // Col 4: RUTA (ej. 1148434)
        // Col 5: FECHA RUTA (ej. 2026-09-30)
        // Col 9: GUIA (ej. WYB473662620)
        // Col 10: ESTADO (ej. ENTREGADO)
        // Col 20: COSTO GUIA (ej. 3.00)
        if (parts[0] && parts[0] !== guideCode && !/^\d+$/.test(parts[0])) {
          declaredProvider = parts[0].slice(0, 150);
        }
        if (parts[1] && parts[1] !== guideCode) {
          declaredAgency = parts[1].slice(0, 100);
        }

        // Buscar fecha YYYY-MM-DD
        const datePart = parts.find((p) => /^\d{4}-\d{2}-\d{2}$/.test(p));
        if (datePart) declaredDate = datePart;

        // Buscar ruta (número de 6 a 10 dígitos)
        const routePart = parts.find((p) => /^\d{6,10}$/.test(p) && p !== guideCode);
        if (routePart) declaredRoute = routePart;

        // Estado declarado (después de la guía)
        if (parts[guideIndex + 1]) {
          const next = parts[guideIndex + 1].toUpperCase();
          if (['ENTREGADO', 'MOTIVADO', 'RECOLECTADO', 'DEVUELTO', 'PENDIENTE'].includes(next)) {
            declaredStatus = next;
          }
        }

        // Costo declarado: buscar último o penúltimo valor numérico positivo razonable
        const numericParts = parts.map((p) => Number(p)).filter((n) => Number.isFinite(n) && n > 0 && n <= 1000);
        if (numericParts.length) {
          declaredCost = numericParts[numericParts.length - 1];
        }
      }
    }

    rows.push({
      guide: guideCode,
      declaredProvider,
      declaredAgency,
      declaredRoute,
      declaredDate,
      declaredStatus: declaredStatus || (line.toUpperCase().includes('ENTREGADO') ? 'ENTREGADO' : null),
      declaredCost,
      declaredWeightKg,
    });
  }

  if (!rows.length) {
    throw new UrbanoGuideAuditValidationError('No se encontraron códigos de guía válidos (WYB... o ENU...).');
  }

  if (rows.length > MAX_AUDIT_BATCH_ROWS) {
    throw new UrbanoGuideAuditValidationError(`El límite máximo por consulta es de ${MAX_AUDIT_BATCH_ROWS} guías. Has ingresado ${rows.length}.`);
  }

  return rows;
}

/**
 * Calcula el resumen de KPIs ejecutivos para el lote auditado.
 */
export function computeAuditSummaryKpis(results: AuditedGuideResult[]): AuditSummaryKpi {
  const total = results.length;
  let found = 0;
  let notFound = 0;
  let cleanDeliveries = 0;
  let motivatedDeliveries = 0;
  let motives1Attempt = 0;
  let motives2Attempts = 0;
  let motives3PlusAttempts = 0;
  let discrepancies = 0;
  let inManagement = 0;
  let totalDeclaredCost = 0;
  let discrepantDeclaredCost = 0;

  for (const item of results) {
    const cost = item.declared.cost ?? 0;
    totalDeclaredCost += cost;

    if (!item.found) {
      notFound++;
      continue;
    }
    found++;

    if (item.audit.classification === 'ENTREGA_DIRECTA') {
      cleanDeliveries++;
    } else if (item.audit.classification === 'ENTREGA_CON_MOTIVOS') {
      motivatedDeliveries++;
      if (item.audit.motives === 1) motives1Attempt++;
      else if (item.audit.motives === 2) motives2Attempts++;
      else motives3PlusAttempts++;
    } else if (item.audit.classification === 'DISCREPANCIA_NO_ENTREGADO') {
      discrepancies++;
      discrepantDeclaredCost += cost;
    } else if (item.audit.classification === 'EN_GESTION') {
      inManagement++;
    }
  }

  const cleanDeliveriesPct = total > 0 ? Number(((cleanDeliveries / total) * 100).toFixed(1)) : 0;
  const motivatedDeliveriesPct = total > 0 ? Number(((motivatedDeliveries / total) * 100).toFixed(1)) : 0;
  const discrepanciesPct = total > 0 ? Number(((discrepancies / total) * 100).toFixed(1)) : 0;
  const inManagementPct = total > 0 ? Number(((inManagement / total) * 100).toFixed(1)) : 0;

  return {
    total,
    found,
    notFound,
    cleanDeliveries,
    cleanDeliveriesPct,
    motivatedDeliveries,
    motivatedDeliveriesPct,
    motives1Attempt,
    motives2Attempts,
    motives3PlusAttempts,
    discrepancies,
    discrepanciesPct,
    inManagement,
    inManagementPct,
    totalDeclaredCost: Number(totalDeclaredCost.toFixed(2)),
    discrepantDeclaredCost: Number(discrepantDeclaredCost.toFixed(2)),
  };
}
