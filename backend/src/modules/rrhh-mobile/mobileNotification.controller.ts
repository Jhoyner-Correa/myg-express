import { Response } from 'express';
import { MobileAuthRequest } from './mobileAuth.middleware';
import { MobileNotificationService } from './mobileNotification.service';

export class MobileNotificationController {
  constructor(private readonly service = new MobileNotificationService()) {}

  list = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
      return res.json({ ok: true, data: await this.service.list(req.employee.id, req.query.limit) });
    } catch (error) {
      console.error('[RRHH Mobile] Error consultando notificaciones:', error);
      return res.status(500).json({ ok: false, code: 'NOTIFICATION_QUERY_ERROR', message: 'No se pudieron cargar las notificaciones.' });
    }
  };

  markRead = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
      await this.service.markRead(req.employee.id, Number(req.params.id));
      return res.json({ ok: true, data: { id: Number(req.params.id), read: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar la notificacion.';
      return res.status(message === 'Notificacion no encontrada.' ? 404 : 422).json({ ok: false, code: 'NOTIFICATION_UPDATE_ERROR', message });
    }
  };

  markAllRead = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
      const updated = await this.service.markAllRead(req.employee.id);
      return res.json({ ok: true, data: { updated } });
    } catch (error) {
      console.error('[RRHH Mobile] Error actualizando notificaciones:', error);
      return res.status(500).json({ ok: false, code: 'NOTIFICATION_UPDATE_ERROR', message: 'No se pudieron actualizar las notificaciones.' });
    }
  };
}
