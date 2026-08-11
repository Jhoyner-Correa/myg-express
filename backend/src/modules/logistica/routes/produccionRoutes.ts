import { Router } from 'express';

import {
  consultarRutaUrbano,
  estadoUrbano,
  limpiarConsultaUrbano,
  obtenerUltimaConsultaUrbano
} from '../controllers/produccionController';
import { PERMISSIONS } from '../../../core/constants/permissions';
import { verificarToken } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken);

router.get('/status', requirePermission(PERMISSIONS.URBANO_ROUTES_VIEW), estadoUrbano);
router.get('/cache/ultima', requirePermission(PERMISSIONS.URBANO_ROUTES_VIEW), obtenerUltimaConsultaUrbano);
router.delete('/cache', requirePermission(PERMISSIONS.URBANO_ROUTES_VIEW), limpiarConsultaUrbano);
router.get('/rutas/:routeId', requirePermission(PERMISSIONS.URBANO_ROUTES_VIEW), consultarRutaUrbano);

export default router;
