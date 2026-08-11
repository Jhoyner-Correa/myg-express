// ============================================================
// backend/src/modules/auth/auth.routes.ts
// Definición de endpoints HTTP del módulo de Autenticación
// ============================================================

import { Router } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MySqlUsuarioRepository } from './repositories/mysql/MySqlUsuarioRepository';
import { verificarToken } from '../../core/middlewares/authMiddleware';

const router = Router();

// Inyección de dependencias manual (Pure Dependency Injection)
const usuarioRepository = new MySqlUsuarioRepository();
const authService = new AuthService(usuarioRepository);
const authController = new AuthController(authService);

// Mapeo de endpoints
router.post('/login', authController.login);
router.get('/perfil', verificarToken, authController.perfil);
router.put('/perfil', verificarToken, authController.actualizarPerfil);

export default router;
