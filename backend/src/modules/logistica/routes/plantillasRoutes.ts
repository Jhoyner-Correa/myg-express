// ============================================================
// routes/plantillasRoutes.ts
// Definición de rutas para el módulo de plantillas
// ============================================================

import { Router } from 'express';
import {
  listarPlantillas,
  crearPlantilla,
  actualizarPlantilla,
  eliminarPlantilla,
  establecerPlantillaDefault
} from '../controllers/plantillasController';
import { PERMISSIONS } from '../../../core/constants/permissions';
import { verificarToken } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken);

router.get('/', requirePermission(PERMISSIONS.TEMPLATES_VIEW), listarPlantillas);
router.put('/default', requirePermission(PERMISSIONS.TEMPLATES_MANAGE), establecerPlantillaDefault);
router.post('/', requirePermission(PERMISSIONS.TEMPLATES_MANAGE), crearPlantilla);
router.put('/:id', requirePermission(PERMISSIONS.TEMPLATES_MANAGE), actualizarPlantilla);
router.delete('/:id', requirePermission(PERMISSIONS.TEMPLATES_MANAGE), eliminarPlantilla);

export default router;
