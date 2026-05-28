// ============================================================
// routes/plantillasRoutes.ts
// Definición de rutas para el módulo de plantillas
// ============================================================

import { Router } from 'express';
import {
  listarPlantillas,
  crearPlantilla,
  actualizarPlantilla,
  eliminarPlantilla
} from '../controllers/plantillasController';
import { verificarToken } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', verificarToken, listarPlantillas);
router.post('/', verificarToken, crearPlantilla);
router.put('/:id', verificarToken, actualizarPlantilla);
router.delete('/:id', verificarToken, eliminarPlantilla);

export default router;
