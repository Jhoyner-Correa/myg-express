import { Router } from 'express';
import { actualizarPerfil, login, perfil } from '../controllers/authController';
import { verificarToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/login', login);
router.get('/perfil', verificarToken, perfil);
router.put('/perfil', verificarToken, actualizarPerfil);

export default router;
