import { Router } from 'express';
import {
  crearZona,
  listarZonas,
  eliminarZona
} from '../controllers/zonasController';
import { PERMISSIONS } from '../constants/permissions';
import { verificarToken } from '../middlewares/authMiddleware';
import { requirePermission } from '../middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken);

router.get('/', requirePermission(PERMISSIONS.ROUTES_VIEW), listarZonas);
router.post('/', requirePermission(PERMISSIONS.ROUTES_MANAGE), crearZona);
router.delete('/:id', requirePermission(PERMISSIONS.ROUTES_MANAGE), eliminarZona);

export default router;
