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
}

export const QUEUE_NAME = 'whatsapp-mensajes';

export const waQueue = new Queue<WhatsappJobData>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000 // 5s, 25s, 125s
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 }
  }
});

/**
 * Encola un lote completo de avisos a la vez.
 */
export async function encolarLote(
  loteId: number,
  avisos: any[],
  sesionId: number
) {
  const jobs = avisos.map((aviso, index) => ({
    name: 'enviar-mensaje',
    data: {
      avisoId: aviso.id,
      loteId: aviso.lote_id,
      sedeId: aviso.sede_id,
      telefono: aviso.telefono,
      nombre: aviso.nombre,
      codigo: aviso.codigo_paquete,
      sesionId: sesionId,
      plantillaId: aviso.id_plantilla
    },
    opts: {
      // Escalona el envío: 1 mensaje cada 3 segundos
      delay: index * 3000,
      jobId: `aviso-${aviso.id}` // Evita duplicados si se presiona Enviar 2 veces
    }
  }));

  await waQueue.addBulk(jobs);
}
