import { Router } from 'express';
import {
  buscarClientesEntrega,
  buscarPaquetesEntrega,
  obtenerPaquetesCliente,
  obtenerResumenEntregas,
  marcarPaqueteRecogido,
  revertirPaqueteRecogido
} from '../controllers/entregasController';
import { PERMISSIONS } from '../../../core/constants/permissions';
import { verificarToken } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken);

router.get('/resumen', requirePermission(PERMISSIONS.DELIVERIES_VIEW), obtenerResumenEntregas);
router.get('/clientes', requirePermission(PERMISSIONS.DELIVERIES_VIEW), buscarClientesEntrega);
router.get('/clientes/:key/paquetes', requirePermission(PERMISSIONS.DELIVERIES_VIEW), obtenerPaquetesCliente);
router.get('/', requirePermission(PERMISSIONS.DELIVERIES_VIEW), buscarPaquetesEntrega);
router.patch('/:id/recoger', requirePermission(PERMISSIONS.DELIVERIES_MANAGE), marcarPaqueteRecogido);
router.patch('/:id/pendiente', requirePermission(PERMISSIONS.DELIVERIES_MANAGE), revertirPaqueteRecogido);

export default router;
