import { Router } from 'express';
import {
  procesarEscaneo,
  importarPaquetes,
  listarPaquetes,
  listarLotes,
  listarFaltantes,
  restablecerEscaneos,
  eliminarLote
} from '../controllers/savarScanController';
import { verificarToken } from '../middlewares/authMiddleware';

const router = Router();

// Todas las rutas de escaneo requieren token válido
router.use(verificarToken);

router.post('/procesar', procesarEscaneo);
router.post('/importar', importarPaquetes);
router.get('/paquetes', listarPaquetes);
router.get('/lotes', listarLotes);
router.get('/faltantes', listarFaltantes);
router.post('/reset', restablecerEscaneos);
router.delete('/lotes/:nombre', eliminarLote);

export default router;
