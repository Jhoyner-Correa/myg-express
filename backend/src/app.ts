import dotenv from 'dotenv';
import path from 'path';
import { NextFunction, Request, Response } from 'express';
import express from 'express';

import adminRoutes from './routes/adminRoutes';
import authRoutes from './routes/authRoutes';
import avisosRoutes from './routes/avisosRoutes';
import lotesRoutes from './routes/lotesRoutes';
import plantillasRoutes from './routes/plantillasRoutes';
import produccionRoutes from './routes/produccionRoutes';
import whatsappRoutes from './routes/whatsappRoutes';
import whatsappSesionesRoutes from './routes/whatsappSesionesRoutes';
import { createHttpApp } from './server/createHttpApp';

// BullMQ
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { waQueue } from './queues/whatsapp.queue';
import './workers/whatsapp.worker'; // Importar worker para que empiece a escuchar

dotenv.config();

const app = createHttpApp();
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const frontendDir = path.resolve(__dirname, '../../frontend');

function sendFrontendFile(fileName: string) {
  return (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDir, fileName));
  };
}

// Configurar Bull Board
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(waQueue)],
  serverAdapter: serverAdapter
});

app.use('/api/admin/queues', serverAdapter.getRouter());

app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/avisos', avisosRoutes);
app.use('/api/lotes', lotesRoutes);
app.use('/api/plantillas', plantillasRoutes);
app.use('/api/produccion', produccionRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/whatsapp-sesiones', whatsappSesionesRoutes);

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

app.use(express.static(frontendDir));

app.get('/', (_req, res) => {
  res.redirect('/login');
});

app.get('/login', sendFrontendFile('login.html'));
app.get('/dashboard', (_req, res) => {
  res.redirect('/panel-de-control');
});
app.get('/panel-de-control', sendFrontendFile('dashboard.html'));
app.get('/panel de control', (_req, res) => {
  res.redirect('/panel-de-control');
});
app.get('/admin', sendFrontendFile('admin.html'));
app.get('/whatsapp', sendFrontendFile('whatsapp.html'));
app.get('/consulta-rutas', sendFrontendFile('consulta-rutas.html'));
app.get('/rutas', sendFrontendFile('rutas.html'));
app.get('/rutas/:ref', sendFrontendFile('rutas-detalle.html'));
app.get('/produccion', (_req, res) => {
  res.redirect('/consulta-rutas');
});
app.get('/lotes', (_req, res) => {
  res.redirect('/rutas');
});
app.get('/lotes/:ref', (req, res) => {
  res.redirect(`/rutas/${encodeURIComponent(req.params.ref)}`);
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
