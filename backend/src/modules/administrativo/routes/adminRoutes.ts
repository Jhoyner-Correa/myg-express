import { Router } from 'express';
import {
  actualizarPasswordUsuarioAdmin,
  actualizarMisModulosAdmin,
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
import {
  consultarDetalleGuiaUrbano,
  consultarGuiasDespachoUrbano,
  listarDespachosUrbano,
  listarSedesDespachosUrbano,
} from '../controllers/urbanoDispatchController';

const router = Router();

router.use(verificarToken);

router.get('/urbano-despachos/sedes', requirePermission(PERMISSIONS.URBANO_DISPATCHES_VIEW), listarSedesDespachosUrbano);
router.get('/urbano-despachos', requirePermission(PERMISSIONS.URBANO_DISPATCHES_VIEW), listarDespachosUrbano);
router.get('/urbano-despachos/guias', requirePermission(PERMISSIONS.URBANO_DISPATCHES_VIEW), consultarGuiasDespachoUrbano);
router.get('/urbano-despachos/guias/detalle', requirePermission(PERMISSIONS.URBANO_DISPATCHES_VIEW), consultarDetalleGuiaUrbano);

router.use(requirePermission(PERMISSIONS.ADMIN_PANEL_VIEW));

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
router.patch('/usuarios/me/modules', requirePermission(PERMISSIONS.USERS_MANAGE), actualizarMisModulosAdmin);
router.put('/usuarios/:id', requirePermission(PERMISSIONS.USERS_MANAGE), actualizarUsuarioAdmin);
router.patch('/usuarios/:id/password', requirePermission(PERMISSIONS.USERS_MANAGE), actualizarPasswordUsuarioAdmin);
router.delete('/usuarios/:id', requirePermission(PERMISSIONS.USERS_MANAGE), eliminarUsuarioAdmin);

export default router;
