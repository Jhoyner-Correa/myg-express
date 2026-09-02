import { Router } from 'express';
import {
  crearLote,
  listarLotes,
  obtenerLotePorId,
  actualizarLote,
  eliminarLote
} from '../controllers/lotesController';
import { PERMISSIONS } from '../../../core/constants/permissions';
import { verificarToken } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken);

router.post('/', requirePermission(PERMISSIONS.ROUTES_MANAGE), crearLote);
router.get('/', requirePermission(PERMISSIONS.ROUTES_VIEW), listarLotes);
router.get('/:id', requirePermission(PERMISSIONS.ROUTES_VIEW), obtenerLotePorId);
router.put('/:id', requirePermission(PERMISSIONS.ROUTES_MANAGE), actualizarLote);
router.delete('/:id', requirePermission(PERMISSIONS.ROUTES_MANAGE), eliminarLote);

export default router;
