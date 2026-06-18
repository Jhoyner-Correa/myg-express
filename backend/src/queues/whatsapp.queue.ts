import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.config';

export interface WhatsappJobData {
  avisoId: number;
  loteId: number;
  sedeId: number;
  telefono: string;
  nombre: string | null;
  codigo: string | null;
  sesionId: number;
  plantillaId: number;
  orden: number;
}

export const QUEUE_NAME = 'whatsapp-mensajes';

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const jobAttempts = Math.max(1, envNumber('WHATSAPP_JOB_ATTEMPTS', 1));
const jobRetryDelayMs = Math.max(1000, envNumber('WHATSAPP_JOB_RETRY_DELAY_MS', 120000));
const interMessageDelayMs = Math.max(1000, envNumber('WHATSAPP_INTER_MESSAGE_DELAY_MS', 25000));
const batchSize = Math.max(1, envNumber('WHATSAPP_BATCH_SIZE', 15));
const batchPauseMs = Math.max(0, envNumber('WHATSAPP_BATCH_PAUSE_MS', 300000));
const jitterMs = Math.min(
  Math.floor(interMessageDelayMs / 2),
  Math.max(0, envNumber('WHATSAPP_INTER_MESSAGE_JITTER_MS', 8000))
);

export const waQueue = new Queue<WhatsappJobData>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: jobAttempts,
    backoff: {
      type: 'exponential',
      delay: jobRetryDelayMs
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }
  }
});

function calculateSafeDelay(index: number): number {
  const batchPauses = Math.floor(index / batchSize);
  const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  return (index * interMessageDelayMs) + (batchPauses * batchPauseMs) + jitter;
}

/**
 * Encola un lote completo respetando el orden original de los avisos.
 */
export async function encolarLote(
  loteId: number,
  avisos: any[],
  sesionId: number
) {
  const dispatchId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const jobs = avisos.map((aviso, index) => ({
    name: 'enviar-mensaje',
    data: {
      avisoId: aviso.id,
      loteId: aviso.lote_id || loteId,
      sedeId: aviso.sede_id,
      telefono: aviso.telefono,
      nombre: aviso.nombre,
      codigo: aviso.codigo_paquete,
      sesionId,
      plantillaId: aviso.id_plantilla,
      orden: index + 1
    },
    opts: {
      delay: calculateSafeDelay(index),
      jobId: `lote-${loteId}-aviso-${aviso.id}-${dispatchId}`
    }
  }));

  await waQueue.addBulk(jobs);
}
