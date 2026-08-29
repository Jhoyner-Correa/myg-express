import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { NextFunction, Request, Response } from 'express';
import express from 'express';

import adminRoutes from './modules/administrativo/routes/adminRoutes';
import authRoutes from './modules/auth/auth.routes';
import avisosRoutes from './modules/logistica/routes/avisosRoutes';
import entregasRoutes from './modules/logistica/routes/entregasRoutes';
import lotesRoutes from './modules/logistica/routes/lotesRoutes';
import plantillasRoutes from './modules/logistica/routes/plantillasRoutes';
import produccionRoutes from './modules/logistica/routes/produccionRoutes';
import whatsappRoutes from './modules/logistica/routes/whatsappRoutes';
import whatsappSesionesRoutes from './modules/logistica/routes/whatsappSesionesRoutes';
import zonasRoutes from './modules/logistica/routes/zonasRoutes';
import savarScanRoutes from './modules/logistica/routes/savarScanRoutes';
import rrhhRoutes from './modules/rrhh/rrhh.routes';
import gpsRoutes from './modules/gps/gps.routes';
import rrhhMobileRoutes from './modules/rrhh-mobile/mobile.routes';
import { createHttpApp } from './core/server/createHttpApp';
import { verificarToken } from './core/middlewares/authMiddleware';
import { PERMISSIONS } from './core/constants/permissions';
import { requirePermission } from './core/middlewares/permissionMiddleware';
import { validateRuntimeEnvironment } from './core/config/runtimeEnvironment';
import { pool } from './core/database/database';
import { redisConnection } from './core/config/redis.config';

// BullMQ
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { waQueue } from './queues/whatsapp.queue';

validateRuntimeEnvironment('api');

const app = createHttpApp();
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const frontendDir = path.resolve(__dirname, '../../frontend-react/dist');

// Configurar Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(waQueue)],
  serverAdapter: serverAdapter
});

app.use('/api/admin/queues', verificarToken, requirePermission(PERMISSIONS.QUEUES_VIEW), serverAdapter.getRouter());

app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/avisos', avisosRoutes);
app.use('/api/entregas', entregasRoutes);
app.use('/api/lotes', lotesRoutes);
app.use('/api/plantillas', plantillasRoutes);
app.use('/api/produccion', produccionRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/whatsapp-sesiones', whatsappSesionesRoutes);
app.use('/api/zonas', zonasRoutes);
app.use('/api/savar-scan', savarScanRoutes);
app.use('/api/rrhh', rrhhRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/mobile/rrhh', rrhhMobileRoutes);

app.get('/api', (_req, res) => {
  res.json({
    ok: true,
    mensaje: 'Sistema de mensajeria API funcionando correctamente',
    version: '1.0.0'
  });
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    const redisStatus = await redisConnection.ping();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      dependencies: { database: 'ok', redis: redisStatus === 'PONG' ? 'ok' : 'degraded' },
    });
  } catch (error) {
    console.error('[Health] Dependencia no disponible:', error);
    res.status(503).json({
      status: 'unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/storage', express.static(path.resolve(process.cwd(), 'storage')));
app.use(express.static(frontendDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({
    ok: false,
    error: 'Error interno del servidor'
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`API corriendo en http://${HOST}:${PORT}`);
});

let shuttingDown = false;
async function shutdownApi(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Apagando API por ${signal}...`);

  const forceExit = setTimeout(() => {
    console.error('La API no termino dentro del plazo de seguridad.');
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.allSettled([
    waQueue.close(),
    pool.end(),
    redisConnection.quit(),
  ]);
  clearTimeout(forceExit);
  process.exit(0);
}

process.on('SIGINT', () => void shutdownApi('SIGINT'));
process.on('SIGTERM', () => void shutdownApi('SIGTERM'));

export default app;
