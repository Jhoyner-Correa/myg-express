// ============================================================
// backend/src/modules/auth/auth.routes.ts
// Definición de endpoints HTTP del módulo de Autenticación
// ============================================================

import { Router } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MySqlUsuarioRepository } from './repositories/mysql/MySqlUsuarioRepository';
import { verificarToken } from '../../core/middlewares/authMiddleware';
import rateLimit from 'express-rate-limit';
import { receiveUserPhoto } from './userPhotoUpload';

const router = Router();

// Inyección de dependencias manual (Pure Dependency Injection)
const usuarioRepository = new MySqlUsuarioRepository();
const authService = new AuthService(usuarioRepository);
const authController = new AuthController(authService);
const profilePhotoLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    ok: false,
    mensaje: 'Demasiados intentos de acceso. Espera unos minutos antes de volver a intentarlo.',
  },
});

// Mapeo de endpoints
router.post('/login', loginLimiter, authController.login);
router.get('/perfil', verificarToken, authController.perfil);
router.put('/perfil', verificarToken, authController.actualizarPerfil);
router.put('/perfil/foto', verificarToken, profilePhotoLimiter, receiveUserPhoto, authController.actualizarFotoPerfil);
router.delete('/perfil/foto', verificarToken, profilePhotoLimiter, authController.eliminarFotoPerfil);

export default router;
