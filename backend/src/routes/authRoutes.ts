import { Router } from 'express';
import { login, perfil } from '../controllers/authController';
import { verificarToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/login', login);
router.get('/perfil', verificarToken, perfil);

export default router;