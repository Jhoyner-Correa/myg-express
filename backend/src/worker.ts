import dotenv from 'dotenv';
import { NextFunction, Request, Response } from 'express';

import { pool } from './core/database/database';
import { PERMISSIONS } from './core/constants/permissions';
import { verificarToken } from './core/middlewares/authMiddleware';
import { requirePermission } from './core/middlewares/permissionMiddleware';
import whatsappRoutes from './modules/logistica/routes/whatsappRoutes';
import whatsappSesionesRoutes from './modules/logistica/routes/whatsappSesionesRoutes';
import { createHttpApp } from './core/server/createHttpApp';
import databaseCleanupService from './services/maintenance/databaseCleanupService';
import whatsappService from './services/whatsapp/whatsappService';
import { waQueue } from './queues/whatsapp.queue';
import { whatsappWorker } from './workers/whatsapp.worker';

dotenv.config();

const app = createHttpApp();
const PORT = Number(process.env.WHATSAPP_WORKER_PORT || 3001);
const HOST = '0.0.0.0';
const workerLockName = process.env.WHATSAPP_WORKER_LOCK_NAME || 'myg_express_whatsapp_worker';
const requireWorkerDbLock = String(process.env.WHATSAPP_WORKER_REQUIRE_DB_LOCK || 'true').toLowerCase() !== 'false';
const bootstrapActiveSessions = String(process.env.WHATSAPP_BOOTSTRAP_ACTIVE_SESSIONS || 'false').toLowerCase() === 'true';

let workerLockAcquired = false;
let shuttingDown = false;

async function acquireWorkerLock() {
  if (!requireWorkerDbLock) {
    console.warn('Proteccion de worker unico deshabilitada por configuracion');
    return;
  }

  const [rows]: any = await pool.query(
    'SELECT GET_LOCK(?, 0) AS worker_lock',
    [workerLockName]
  );

  if (Number(rows?.[0]?.worker_lock || 0) !== 1) {
    throw new Error(`No se pudo adquirir el candado del worker "${workerLockName}". Ya existe otra instancia activa.`);
  }

  workerLockAcquired = true;
}

async function releaseWorkerLock() {
  if (!workerLockAcquired || !requireWorkerDbLock) {
    return;
  }

  try {
    await pool.query('SELECT RELEASE_LOCK(?)', [workerLockName]);
  } catch (error) {
    console.error('Error liberando candado del worker:', error);
  } finally {
    workerLockAcquired = false;
  }
}

async function shutdownWorker(signal: string) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Apagando WhatsApp worker por ${signal}...`);
  try {
    await whatsappWorker.close();
  } catch (err: any) {
    console.error('Error cerrando el worker de BullMQ:', err.message);
  }
  databaseCleanupService.stop();
  await releaseWorkerLock();
  process.exit(0);
}

app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/whatsapp-sesiones', whatsappSesionesRoutes);

app.get('/api/whatsapp/health', verificarToken, requirePermission(PERMISSIONS.QUEUES_VIEW), async (_req, res) => {
  let queueStats = { active: 0, completed: 0, failed: 0, delayed: 0, waiting: 0, paused: 0 };
  try {
    queueStats = await waQueue.getJobCounts() as any;
  } catch (err: any) {
    console.error('Error obteniendo estadisticas de la cola:', err.message);
  }
  const cleanup = databaseCleanupService.getSnapshot();

  res.json({
    ok: true,
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    queue: queueStats,
    cleanup
  });
});

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    mensaje: 'MyG Express WhatsApp worker activo',
    api: '/api/whatsapp'
  });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    ok: false,
    error: 'Error interno del worker'
  });
});

process.on('SIGINT', () => {
  void shutdownWorker('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdownWorker('SIGTERM');
});

async function bootstrapWorker() {
  await acquireWorkerLock();

  app.listen(PORT, HOST, async () => {
    console.log(`WhatsApp worker corriendo en http://${HOST}:${PORT}`);
    console.log('Worker de BullMQ activo y escuchando cola de mensajes.');
    databaseCleanupService.start();

    if (bootstrapActiveSessions) {
      void whatsappService.bootstrapActiveSessions()
        .then(() => {
          console.log('Sesiones activas de WhatsApp rehidratadas');
        })
        .catch((error) => {
          console.error('Error rehidratando sesiones activas de WhatsApp:', error);
        });
    } else {
      console.log('Rehidratacion automatica de sesiones deshabilitada para ahorrar memoria');
    }
  });
}

void bootstrapWorker().catch(async (error) => {
  console.error('No se pudo iniciar el WhatsApp worker:', error);
  await releaseWorkerLock();
  process.exit(1);
});

export default app;
