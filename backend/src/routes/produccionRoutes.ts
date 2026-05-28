import { Router } from 'express';

import {
  cerrarUrbano,
  conectarUrbano,
  consultarRutaUrbano,
  estadoUrbano
} from '../controllers/produccionController';
import { verificarToken } from '../middlewares/authMiddleware';

const router = Router();

router.get('/status', verificarToken, estadoUrbano);
router.post('/login', verificarToken, conectarUrbano);
router.post('/logout', verificarToken, cerrarUrbano);
router.get('/rutas/:routeId', verificarToken, consultarRutaUrbano);

export default router;
