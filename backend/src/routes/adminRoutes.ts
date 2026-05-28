import { Router } from 'express';
import {
  actualizarSedeAdmin,
  actualizarUsuarioAdmin,
  crearSedeAdmin,
  crearUsuarioAdmin,
  eliminarSedeAdmin,
  eliminarUsuarioAdmin,
  listarSedesAdmin,
  listarUsuariosAdmin,
  obtenerResumenAdmin
} from '../controllers/adminController';
import { verificarToken } from '../middlewares/authMiddleware';
import { verificarSuperadmin } from '../middlewares/superadminMiddleware';

const router = Router();

router.use(verificarToken, verificarSuperadmin);

router.get('/overview', obtenerResumenAdmin);
router.get('/sedes', listarSedesAdmin);
router.post('/sedes', crearSedeAdmin);
router.put('/sedes/:id', actualizarSedeAdmin);
router.delete('/sedes/:id', eliminarSedeAdmin);

router.get('/usuarios', listarUsuariosAdmin);
router.post('/usuarios', crearUsuarioAdmin);
router.put('/usuarios/:id', actualizarUsuarioAdmin);
router.delete('/usuarios/:id', eliminarUsuarioAdmin);

export default router;
