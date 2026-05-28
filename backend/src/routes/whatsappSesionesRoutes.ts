import { Router } from 'express';
import {
  listarSesionesWhatsApp,
  crearSesionWhatsApp,
  iniciarSesionWhatsApp,
  obtenerEstadoSesionWhatsApp,
  obtenerQrSesionWhatsApp,
  reconectarSesionWhatsApp,
  cerrarSesionWhatsApp,
  eliminarSesionWhatsApp
} from '../controllers/whatsappSesionesController';
import { verificarToken } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', verificarToken, listarSesionesWhatsApp);
router.post('/', verificarToken, crearSesionWhatsApp);
router.get('/:id/status', verificarToken, obtenerEstadoSesionWhatsApp);
router.get('/:id/qr', verificarToken, obtenerQrSesionWhatsApp);
router.post('/:id/init', verificarToken, iniciarSesionWhatsApp);
router.post('/:id/reconnect', verificarToken, reconectarSesionWhatsApp);
router.post('/:id/logout', verificarToken, cerrarSesionWhatsApp);
router.delete('/:id', verificarToken, eliminarSesionWhatsApp);

export default router;
