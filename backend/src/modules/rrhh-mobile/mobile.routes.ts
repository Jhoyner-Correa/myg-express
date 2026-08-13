import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { MySqlAsistenciaRepository } from '../rrhh/repositories/mysql/MySqlAsistenciaRepository';
import { MySqlEmpleadoRepository } from '../rrhh/repositories/mysql/MySqlEmpleadoRepository';
import { MySqlMarcacionRepository } from '../rrhh/repositories/mysql/MySqlMarcacionRepository';
import { AsistenciaService } from '../rrhh/services/AsistenciaService';
import { MobileAttendanceController } from './mobileAttendance.controller';
import { MobileAuthController } from './mobileAuth.controller';
import { verifyMobileEmployee } from './mobileAuth.middleware';
import { MobileAuthService } from './mobileAuth.service';

const router = Router();
const activationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Demasiados intentos. Espera unos minutos.' },
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Demasiadas solicitudes de sesion.' },
});

const authService = new MobileAuthService();
const authController = new MobileAuthController(authService);
const attendanceController = new MobileAttendanceController(new AsistenciaService(
  new MySqlAsistenciaRepository(),
  new MySqlMarcacionRepository(),
  new MySqlEmpleadoRepository(),
));

router.post('/auth/activate', activationLimiter, authController.activate);
router.post('/auth/refresh', refreshLimiter, authController.refresh);
router.post('/auth/change-password', verifyMobileEmployee, authController.changePassword);
router.post('/auth/logout', verifyMobileEmployee, authController.logout);
router.post('/attendance/challenge', verifyMobileEmployee, attendanceController.createChallenge);
router.post('/attendance/clock', verifyMobileEmployee, attendanceController.register);

export default router;
