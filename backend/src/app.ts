import dotenv from 'dotenv';
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

// BullMQ
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { waQueue } from './queues/whatsapp.queue';

dotenv.config();

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

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
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

app.listen(PORT, HOST, () => {
  console.log(`API corriendo en http://${HOST}:${PORT}`);
});

export default app;
