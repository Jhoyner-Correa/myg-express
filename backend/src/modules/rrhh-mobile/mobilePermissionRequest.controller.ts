import { Response } from 'express';
import { MobileAuthRequest } from './mobileAuth.middleware';
import { MobilePermissionRequestService } from './mobilePermissionRequest.service';

export class MobilePermissionRequestController {
  constructor(private readonly service = new MobilePermissionRequestService()) {}

  list = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Sesion requerida.' });
      return res.json({ ok: true, data: await this.service.list(req.employee.id) });
    } catch (error) {
      console.error('[RRHH Mobile] Error consultando solicitudes:', error);
      return res.status(500).json({ ok: false, code: 'REQUEST_QUERY_ERROR', message: 'No se pudieron cargar tus solicitudes.' });
    }
  };

  create = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Sesion requerida.' });
      const data = await this.service.create(req.employee.id, req.employee.deviceId, req.body, req.file);
      return res.status(201).json({ ok: true, message: 'Solicitud enviada a Recursos Humanos.', data });
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? Number((error as { statusCode: number }).statusCode) : 422;
      return res.status(statusCode).json({ ok: false, code: 'REQUEST_CREATE_ERROR', message: error instanceof Error ? error.message : 'No se pudo registrar la solicitud.' });
    }
  };

  cancel = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Sesion requerida.' });
      await this.service.cancel(req.employee.id, req.employee.deviceId, Number(req.params.id));
      return res.json({ ok: true, message: 'Solicitud cancelada.', data: { id: Number(req.params.id) } });
    } catch (error) {
      return res.status(422).json({ ok: false, code: 'REQUEST_CANCEL_ERROR', message: error instanceof Error ? error.message : 'No se pudo cancelar la solicitud.' });
    }
  };
}
