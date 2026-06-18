import { Router } from 'express';
import {
  crearAviso,
  listarAvisosPorLote,
  actualizarEstadoAviso,
  importarAvisos,
  eliminarAviso,
  eliminarAvisosPorLote
} from '../controllers/avisosController';
import { PERMISSIONS } from '../constants/permissions';
import { verificarToken } from '../middlewares/authMiddleware';
import { requirePermission } from '../middlewares/permissionMiddleware';

const router = Router();

router.use(verificarToken);

router.post('/', requirePermission(PERMISSIONS.NOTICES_MANAGE), crearAviso);
router.post('/importar', requirePermission(PERMISSIONS.NOTICES_MANAGE), importarAvisos);
router.get('/lote/:loteId', requirePermission(PERMISSIONS.NOTICES_VIEW), listarAvisosPorLote);
router.delete('/lote/:loteId', requirePermission(PERMISSIONS.NOTICES_MANAGE), eliminarAvisosPorLote);
router.patch('/:id/estado', requirePermission(PERMISSIONS.NOTICES_MANAGE), actualizarEstadoAviso);
router.delete('/:id', requirePermission(PERMISSIONS.NOTICES_MANAGE), eliminarAviso);

export default router;
