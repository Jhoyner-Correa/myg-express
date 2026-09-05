import { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

import { AuthRequest } from '../../core/middlewares/authMiddleware';
import { normalizePrintJobInput, PrintingValidationError } from './printingDomain';
import { PrintAgent, printingService, UserScope } from './printingService';

export interface PrintAgentRequest extends Request {
  printAgent?: PrintAgent;
}

function userScope(req: AuthRequest): UserScope {
  if (!req.user) throw new PrintingValidationError('Sesion no disponible.', 401);
  return {
    userId: Number(req.user.id),
    userName: req.user.nombre || req.user.usuario,
    companyId: req.user.empresa_id ?? null,
    siteId: req.user.alcance === 'SEDE' ? req.user.sede_id : null,
  };
}

function positiveId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new PrintingValidationError(`${label} no es valido.`);
  return id;
}

function respondError(res: Response, error: unknown, context: string): void {
  if (error instanceof PrintingValidationError) {
    res.status(error.status).json({ ok: false, message: error.message });
    return;
  }
  console.error(`[impresion] ${context}:`, error);
  res.status(500).json({ ok: false, message: 'No se pudo completar la operacion de impresion.' });
}

export async function authenticatePrintAgent(
  req: PrintAgentRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    req.printAgent = await printingService.authenticateAgent(req.headers['x-print-agent-token']);
    next();
  } catch (error) {
    respondError(res, error, 'Autenticacion del agente');
  }
}

export async function listPrintSites(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({ ok: true, data: await printingService.listSites(userScope(req)) });
  } catch (error) {
    respondError(res, error, 'Listado de sedes');
  }
}

export async function listPrintAgents(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({ ok: true, data: await printingService.listAgents(userScope(req), positiveId(req.query.site_id, 'La sede')) });
  } catch (error) { respondError(res, error, 'Listado de conectores'); }
}

export async function downloadPrintConnector(_req: AuthRequest, res: Response): Promise<void> {
  const candidates = [
    process.env.PRINT_CONNECTOR_INSTALLER_PATH,
    path.resolve(process.cwd(), '../print-agent/dist/MyGPrintConnector-Setup.exe'),
    path.resolve(process.cwd(), 'print-agent/dist/MyGPrintConnector-Setup.exe'),
  ].filter(Boolean) as string[];
  const installer = candidates.find(candidate => fs.existsSync(candidate));
  if (!installer) {
    res.status(404).json({ ok: false, message: 'El instalador del conector aun no esta publicado.' });
    return;
  }
  res.download(installer, 'MyGPrintConnector-Setup.exe');
}

export async function createPrintPairing(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await printingService.createPairing(userScope(req), positiveId(req.body?.site_id, 'La sede'));
    res.status(201).json({ ok: true, data });
  } catch (error) { respondError(res, error, 'Vinculacion de conector'); }
}

export async function pairPrintAgent(req: Request, res: Response): Promise<void> {
  try {
    const data = await printingService.pairAgent(req.body?.code, req.body?.computer_name, req.body?.printers, req.body?.version);
    res.status(201).json({ ok: true, data });
  } catch (error) { respondError(res, error, 'Vinculacion del agente'); }
}

export async function selectPrintAgentPrinter(req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = await printingService.selectAgentPrinter(userScope(req), positiveId(req.params.id, 'El conector'), req.body?.printer_name);
    res.json({ ok: true, data });
  } catch (error) { respondError(res, error, 'Seleccion de impresora'); }
}

export async function removePrintAgent(req: AuthRequest, res: Response): Promise<void> {
  try {
    await printingService.removeAgent(userScope(req), positiveId(req.params.id, 'El conector'));
    res.json({ ok: true });
  } catch (error) { respondError(res, error, 'Desvinculacion del conector'); }
}

export async function listPrintJobs(req: AuthRequest, res: Response): Promise<void> {
  try {
    const siteId = positiveId(req.query.site_id, 'La sede');
    const limit = req.query.limit == null ? 50 : Number(req.query.limit);
    res.json({ ok: true, data: await printingService.listJobs(userScope(req), siteId, limit) });
  } catch (error) {
    respondError(res, error, 'Listado de trabajos');
  }
}

export async function createPrintJob(req: AuthRequest, res: Response): Promise<void> {
  try {
    const input = normalizePrintJobInput((req.body ?? {}) as Record<string, unknown>);
    const job = await printingService.createJob(userScope(req), input);
    res.status(201).json({ ok: true, data: job });
  } catch (error) {
    respondError(res, error, 'Creacion de trabajo');
  }
}

export async function cancelPrintJob(req: AuthRequest, res: Response): Promise<void> {
  try {
    await printingService.cancelJob(userScope(req), positiveId(req.params.id, 'El trabajo'));
    res.json({ ok: true, data: { status: 'CANCELADO' } });
  } catch (error) {
    respondError(res, error, 'Cancelacion de trabajo');
  }
}

export async function retryPrintJob(req: AuthRequest, res: Response): Promise<void> {
  try {
    await printingService.retryJob(userScope(req), positiveId(req.params.id, 'El trabajo'));
    res.json({ ok: true, data: { status: 'PENDIENTE' } });
  } catch (error) {
    respondError(res, error, 'Reintento de trabajo');
  }
}

export async function printAgentHeartbeat(req: PrintAgentRequest, res: Response): Promise<void> {
  try {
    res.json({ ok: true, data: await printingService.heartbeat(req.printAgent!, req.body?.printers, req.body?.version) });
  } catch (error) {
    respondError(res, error, 'Heartbeat del agente');
  }
}

export async function claimPrintJob(req: PrintAgentRequest, res: Response): Promise<void> {
  try {
    res.json({ ok: true, data: await printingService.claimNextJob(req.printAgent!) });
  } catch (error) {
    respondError(res, error, 'Reserva de trabajo');
  }
}

export async function completePrintJob(req: PrintAgentRequest, res: Response): Promise<void> {
  try {
    if (typeof req.body?.success !== 'boolean') {
      throw new PrintingValidationError('El resultado del trabajo no es valido.');
    }
    await printingService.completeJob(
      req.printAgent!,
      positiveId(req.params.id, 'El trabajo'),
      req.body.success,
      req.body.error,
    );
    res.json({ ok: true, data: { status: req.body.success ? 'ENVIADO' : 'ERROR' } });
  } catch (error) {
    respondError(res, error, 'Confirmacion de trabajo');
  }
}
