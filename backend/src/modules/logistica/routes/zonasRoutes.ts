import { Router } from 'express';
import {
  crearZona,
  listarZonas,
  eliminarZona
} from '../controllers/zonasController';
import { PERMISSIONS } from '../../../core/constants/permissions';
import { verificarToken } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken);

router.get('/', requirePermission(PERMISSIONS.ROUTES_VIEW), listarZonas);
router.post('/', requirePermission(PERMISSIONS.ROUTES_MANAGE), crearZona);
router.delete('/:id', requirePermission(PERMISSIONS.ROUTES_MANAGE), eliminarZona);

export default router;
