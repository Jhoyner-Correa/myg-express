import { Response } from 'express';
import { MobileAuthRequest } from './mobileAuth.middleware';
import { MobileOvertimeError, MobileOvertimeService } from './mobileOvertime.service';
import { OvertimeEvidenceError } from '../rrhh/services/OvertimeEvidenceStorageService';

export class MobileOvertimeController {
  constructor(private service = new MobileOvertimeService()) {}

  create = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
      const data = await this.service.declare(req.employee.id, req.body, req.file);
      return res.status(202).json({
        ok: true,
        message: 'Sustento recibido. La duración se cerrará con tu marcación y será revisada por RR. HH.',
        data,
      });
    } catch (error) {
      const known = error instanceof MobileOvertimeError || error instanceof OvertimeEvidenceError;
      if (!known) console.error('[RRHH Mobile] Error registrando sobretiempo:', error);
      return res.status(known ? error.statusCode : 400).json({
        ok: false,
        code: known ? error.code : 'OVERTIME_REQUEST_ERROR',
        message: known ? error.message : 'No se pudo registrar el sustento. Intenta nuevamente.',
      });
    }
  };
}
