import { NextFunction, Response, Router } from 'express';
import {
  listarSesionesWhatsApp,
  auditarSesionesEvolution,
  crearSesionWhatsApp,
  iniciarSesionWhatsApp,
  obtenerEstadoSesionWhatsApp,
  obtenerQrSesionWhatsApp,
  reconectarSesionWhatsApp,
  cerrarSesionWhatsApp,
  eliminarSesionWhatsApp
} from '../controllers/whatsappSesionesController';
import { PERMISSIONS } from '../../../core/constants/permissions';
import { AuthRequest, verificarToken } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken);

const requireWhatsappAuditAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.tipo_usuario === 'SISTEMA' || req.user?.permisos?.includes(PERMISSIONS.WHATSAPP_VIEW)) {
    return next();
  }

  return res.status(403).json({
    ok: false,
    message: 'No tienes permiso para auditar WhatsApp'
  });
};

router.get('/', requirePermission(PERMISSIONS.WHATSAPP_VIEW), listarSesionesWhatsApp);
router.get('/auditoria/evolution', requireWhatsappAuditAccess, auditarSesionesEvolution);
router.post('/', requirePermission(PERMISSIONS.WHATSAPP_MANAGE), crearSesionWhatsApp);
router.get('/:id/status', requirePermission(PERMISSIONS.WHATSAPP_VIEW), obtenerEstadoSesionWhatsApp);
router.get('/:id/qr', requirePermission(PERMISSIONS.WHATSAPP_VIEW), obtenerQrSesionWhatsApp);
router.post('/:id/init', requirePermission(PERMISSIONS.WHATSAPP_MANAGE), iniciarSesionWhatsApp);
router.post('/:id/reconnect', requirePermission(PERMISSIONS.WHATSAPP_MANAGE), reconectarSesionWhatsApp);
router.post('/:id/logout', requirePermission(PERMISSIONS.WHATSAPP_MANAGE), cerrarSesionWhatsApp);
router.delete('/:id', requirePermission(PERMISSIONS.WHATSAPP_MANAGE), eliminarSesionWhatsApp);

export default router;
