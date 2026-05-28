import { Router } from 'express';
import {
  crearAviso,
  listarAvisosPorLote,
  actualizarEstadoAviso,
  importarAvisos,
  eliminarAviso,
  eliminarAvisosPorLote
} from '../controllers/avisosController';
import { verificarToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/', verificarToken, crearAviso);
router.post('/importar', verificarToken, importarAvisos);
router.get('/lote/:loteId', verificarToken, listarAvisosPorLote);
router.delete('/lote/:loteId', verificarToken, eliminarAvisosPorLote);
router.patch('/:id/estado', verificarToken, actualizarEstadoAviso);
router.delete('/:id', verificarToken, eliminarAviso);

export default router;
