import { Router } from 'express';
import {
  actualizarSedeAdmin,
  actualizarUsuarioAdmin,
  crearSedeAdmin,
  crearUsuarioAdmin,
  eliminarCredencialUrbanoAdmin,
  eliminarSedeAdmin,
  eliminarUsuarioAdmin,
  guardarCredencialUrbanoAdmin,
  listarCredencialesUrbanoAdmin,
  listarSedesAdmin,
  listarUsuariosAdmin,
  obtenerCatalogoAccesosAdmin,
  obtenerDetalleUsuarioAdmin,
  obtenerResumenAdmin
} from '../controllers/adminController';
import { verificarToken } from '../../../core/middlewares/authMiddleware';
import { PERMISSIONS } from '../../../core/constants/permissions';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken, requirePermission(PERMISSIONS.ADMIN_PANEL_VIEW));

router.get('/overview', obtenerResumenAdmin);
router.get('/sedes', listarSedesAdmin);
router.post('/sedes', requirePermission(PERMISSIONS.SEDES_MANAGE), crearSedeAdmin);
router.put('/sedes/:id', requirePermission(PERMISSIONS.SEDES_MANAGE), actualizarSedeAdmin);
router.delete('/sedes/:id', requirePermission(PERMISSIONS.SEDES_MANAGE), eliminarSedeAdmin);

router.get('/urbano-credenciales', requirePermission(PERMISSIONS.SEDES_MANAGE), listarCredencialesUrbanoAdmin);
router.put('/urbano-credenciales/:sedeId', requirePermission(PERMISSIONS.SEDES_MANAGE), guardarCredencialUrbanoAdmin);
router.delete('/urbano-credenciales/:sedeId', requirePermission(PERMISSIONS.SEDES_MANAGE), eliminarCredencialUrbanoAdmin);

router.get('/usuarios', listarUsuariosAdmin);
router.get('/access/catalog', obtenerCatalogoAccesosAdmin);
router.get('/usuarios/:id', obtenerDetalleUsuarioAdmin);
router.post('/usuarios', requirePermission(PERMISSIONS.USERS_MANAGE), crearUsuarioAdmin);
router.put('/usuarios/:id', requirePermission(PERMISSIONS.USERS_MANAGE), actualizarUsuarioAdmin);
router.delete('/usuarios/:id', requirePermission(PERMISSIONS.USERS_MANAGE), eliminarUsuarioAdmin);

export default router;
