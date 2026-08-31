import { Router } from 'express';
import {
  procesarEscaneo,
  importarPaquetes,
  listarPaquetes,
  listarLotes,
  listarFaltantes,
  restablecerEscaneos,
  eliminarLote
} from '../controllers/savarScanController';
import { verificarToken } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';
import { PERMISSIONS } from '../../../core/constants/permissions';

const router = Router();

// Todas las rutas de escaneo requieren token válido
router.use(verificarToken);

router.post('/procesar', requirePermission(PERMISSIONS.SAVAR_SCAN_MANAGE), procesarEscaneo);
router.post('/importar', requirePermission(PERMISSIONS.SAVAR_SCAN_MANAGE), importarPaquetes);
router.get('/paquetes', requirePermission(PERMISSIONS.SAVAR_SCAN_VIEW), listarPaquetes);
router.get('/lotes', requirePermission(PERMISSIONS.SAVAR_SCAN_VIEW), listarLotes);
router.get('/faltantes', requirePermission(PERMISSIONS.SAVAR_SCAN_VIEW), listarFaltantes);
router.post('/reset', requirePermission(PERMISSIONS.SAVAR_SCAN_MANAGE), restablecerEscaneos);
router.delete('/lotes/:nombre', requirePermission(PERMISSIONS.SAVAR_SCAN_MANAGE), eliminarLote);

export default router;
