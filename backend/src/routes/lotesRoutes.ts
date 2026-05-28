import { Router } from 'express';
import {
  crearLote,
  listarLotes,
  obtenerLotePorId,
  actualizarLote
} from '../controllers/lotesController';
import { verificarToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', verificarToken, crearLote);
router.get('/', verificarToken, listarLotes);
router.get('/:id', verificarToken, obtenerLotePorId);
router.put('/:id', verificarToken, actualizarLote);

export default router;