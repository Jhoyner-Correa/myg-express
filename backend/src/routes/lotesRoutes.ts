import { Router } from 'express';
import {
  crearLote,
  listarLotes,
  obtenerLotePorId,
  actualizarLote,
  habilitarEntregasLote,
  eliminarLote
} from '../controllers/lotesController';
import { PERMISSIONS } from '../constants/permissions';
import { verificarToken } from '../middlewares/authMiddleware';
import { requirePermission } from '../middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken);

router.post('/', requirePermission(PERMISSIONS.ROUTES_MANAGE), crearLote);
router.get('/', requirePermission(PERMISSIONS.ROUTES_VIEW), listarLotes);
router.get('/:id', requirePermission(PERMISSIONS.ROUTES_VIEW), obtenerLotePorId);
router.post('/:id/entregas', requirePermission(PERMISSIONS.DELIVERIES_MANAGE), habilitarEntregasLote);
router.put('/:id', requirePermission(PERMISSIONS.ROUTES_MANAGE), actualizarLote);
router.delete('/:id', requirePermission(PERMISSIONS.ROUTES_MANAGE), eliminarLote);

export default router;
