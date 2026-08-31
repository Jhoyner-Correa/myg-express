import { Response } from 'express';
import { AuthRequest } from '../../core/middlewares/authMiddleware';
import { ServicePaymentError, ServicePaymentService } from './services/ServicePaymentService';

function companyScope(req: AuthRequest): number | null {
  if (req.user?.alcance === 'SISTEMA') return null;
  const companyId = Number(req.user?.empresa_id);
  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new ServicePaymentError('La cuenta no tiene una empresa asignada.', 403);
  }
  return companyId;
}

function actorId(req: AuthRequest): number {
  const id = Number(req.user?.id);
  if (!Number.isInteger(id) || id < 1) throw new ServicePaymentError('Sesion administrativa no valida.', 401);
  return id;
}

export class ServicePaymentController {
  constructor(private readonly service = new ServicePaymentService()) {}

  dashboard = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.dashboard(companyScope(req), req.query.sede_id, req.query.periodo));

  history = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.history(companyScope(req), req.query.anio, req.query.sede_id));

  employeeLedger = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.employeeLedger(companyScope(req), req.params.id, req.query.periodo));

  addEmployeeNote = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.addEmployeeNote(companyScope(req), req.params.id, actorId(req), req.body), 201);

  cancelEmployeeNote = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.cancelEmployeeNote(companyScope(req), req.params.id, actorId(req), req.body));

  saveAgreement = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.saveAgreement(companyScope(req), req.params.id, actorId(req), req.body), 201);

  createMovement = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.createMovement(companyScope(req), actorId(req), req.body), 201);

  createLoan = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.createLoan(companyScope(req), actorId(req), req.body), 201);

  generate = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.generate(companyScope(req), actorId(req), req.body.periodo), 201);

  transitionPeriod = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.transitionPeriod(companyScope(req), req.params.id, actorId(req), req.body));

  createBatch = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.createBatch(companyScope(req), req.params.id, actorId(req)), 201);

  registerReceipt = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.registerReceipt(companyScope(req), req.params.id, actorId(req), req.body));

  markPaid = async (req: AuthRequest, res: Response) => this.respond(res, () =>
    this.service.markPaid(companyScope(req), req.params.id, actorId(req), req.body));

  private async respond(res: Response, operation: () => Promise<unknown>, successStatus = 200) {
    try {
      const data = await operation();
      return res.status(successStatus).json({ ok: true, data });
    } catch (error) {
      const statusCode = error instanceof ServicePaymentError ? error.statusCode : 500;
      return res.status(statusCode).json({
        ok: false,
        code: error instanceof ServicePaymentError ? 'RRHH_PAYMENT_RULE' : 'RRHH_PAYMENT_ERROR',
        message: error instanceof Error ? error.message : 'No se pudo completar la operacion de pagos.',
      });
    }
  }
}
