import { RowDataPacket } from 'mysql2';
import { pool } from '../../../core/database/database';
import { fetchGuideDetails, UrbanoGuideDetail } from '../../../services/urbanoService';
import {
  AuditedGuideResult,
  AuditSummaryKpi,
  classifyGuideAudit,
  computeAuditSummaryKpis,
  ParsedAuditRow,
  parseRecipientSignatureAndDni,
} from '../domain/urbanoGuideAuditDomain';

type LocalNoticeRow = RowDataPacket & {
  codigo_paquete: string;
  id: number;
  telefono: string;
  estado_aviso: string;
  fecha_envio: string | null;
};

export type GuideAuditBatchResponse = {
  site: {
    id: number;
    name: string;
  };
  kpis: AuditSummaryKpi;
  records: AuditedGuideResult[];
  auditedAt: string;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const currentIndex = cursor++;
      const value = await worker(items[currentIndex], currentIndex);
      results[currentIndex] = value;
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

export async function executeWybGuidesAudit(params: {
  userId: number;
  sedeId: number;
  siteName: string;
  rows: ParsedAuditRow[];
}): Promise<GuideAuditBatchResponse> {
  const { userId, sedeId, siteName, rows } = params;

  // 1. Consultar cada guía contra Urbano usando concurrencia controlada
  const results = await mapWithConcurrency<ParsedAuditRow, AuditedGuideResult>(
    rows,
    5, // Pool de 5 workers para respuesta en 2-4s sin saturar Urbano
    async (row) => {
      try {
        const detail: UrbanoGuideDetail = await fetchGuideDetails(
          { userId, sedeId },
          row.guide,
        );

        const auditClass = classifyGuideAudit(detail, row.declaredStatus);
        const { signature, dni } = parseRecipientSignatureAndDni(detail.statusDetail);

        return {
          guide: row.guide,
          found: true,
          declared: {
            provider: row.declaredProvider,
            route: row.declaredRoute,
            date: row.declaredDate,
            status: row.declaredStatus,
            cost: row.declaredCost,
            weightKg: row.declaredWeightKg,
            agency: row.declaredAgency,
          },
          urbano: {
            guide: detail.guide,
            tracking: detail.tracking,
            recipient: detail.recipient,
            phone: detail.phone,
            destination: detail.destination,
            address: detail.address,
            status: detail.status,
            statusDetail: detail.statusDetail,
            sender: detail.sender,
            service: detail.service,
            contract: detail.contract,
            pieces: detail.pieces,
            weightKg: detail.weightKg,
            registeredAt: detail.registeredAt,
            estimatedDeliveryDate: detail.estimatedDeliveryDate,
            dates: {
              pickup: detail.dates.pickup,
              dispatched: detail.dates.dispatched,
              admitted: detail.dates.admitted,
              outForDelivery: detail.dates.outForDelivery,
              deadline: detail.dates.deadline,
            },
          },
          audit: {
            classification: auditClass.classification,
            attempts: auditClass.attempts,
            motives: auditClass.motives,
            isDiscrepancy: auditClass.isDiscrepancy,
            recipientSignature: signature,
            recipientDni: dni,
            summaryText: auditClass.summaryText,
          },
          localNotice: null,
        };
      } catch (err: any) {
        const errorMsg = String(err?.message || 'Error al consultar la guía en Urbano');
        const notFound = errorMsg.includes('no encontro') || errorMsg.includes('no contiene') || errorMsg.includes('rechazo');

        const auditClass = classifyGuideAudit(null, row.declaredStatus);

        return {
          guide: row.guide,
          found: false,
          declared: {
            provider: row.declaredProvider,
            route: row.declaredRoute,
            date: row.declaredDate,
            status: row.declaredStatus,
            cost: row.declaredCost,
            weightKg: row.declaredWeightKg,
            agency: row.declaredAgency,
          },
          urbano: null,
          audit: {
            classification: notFound ? 'NO_ENCONTRADO' : 'EN_GESTION',
            attempts: 0,
            motives: 0,
            isDiscrepancy: false,
            recipientSignature: null,
            recipientDni: null,
            summaryText: notFound ? 'Guía no registrada en Urbano' : errorMsg,
          },
          localNotice: null,
          error: errorMsg,
        };
      }
    },
  );

  // 2. Cruce rápido con avisos de WhatsApp locales en MyG Express
  try {
    const guideCodes = rows.map((r) => r.guide);
    if (guideCodes.length > 0) {
      const [noticeRows] = await pool.query<LocalNoticeRow[]>(
        `SELECT codigo_paquete, id, telefono, estado_aviso, DATE_FORMAT(fecha_envio, '%Y-%m-%d %H:%i') AS fecha_envio
           FROM avisos_diarios
          WHERE sede_id = ?
            AND codigo_paquete IN (?)`,
        [sedeId, guideCodes],
      );

      if (noticeRows.length > 0) {
        const noticeMap = new Map<string, LocalNoticeRow>();
        for (const nr of noticeRows) {
          if (nr.codigo_paquete) {
            noticeMap.set(nr.codigo_paquete.toUpperCase(), nr);
          }
        }

        for (const r of results) {
          const matchNotice = noticeMap.get(r.guide);
          if (matchNotice) {
            r.localNotice = {
              avisoId: matchNotice.id,
              telefono: matchNotice.telefono,
              estadoAviso: matchNotice.estado_aviso,
              fechaEnvio: matchNotice.fecha_envio,
            };
          }
        }
      }
    }
  } catch (noticeError) {
    console.warn('[urbanoGuideAudit] Advertencia al cruzar con avisos locales:', noticeError);
  }

  // 3. Consolidar KPIs ejecutivos
  const kpis = computeAuditSummaryKpis(results);

  return {
    site: {
      id: sedeId,
      name: siteName,
    },
    kpis,
    records: results,
    auditedAt: new Date().toISOString(),
  };
}
