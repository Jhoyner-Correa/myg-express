import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { MySqlAsistenciaRepository } from '../rrhh/repositories/mysql/MySqlAsistenciaRepository';
import { MySqlEmpleadoRepository } from '../rrhh/repositories/mysql/MySqlEmpleadoRepository';
import { MySqlMarcacionRepository } from '../rrhh/repositories/mysql/MySqlMarcacionRepository';
import { AsistenciaService } from '../rrhh/services/AsistenciaService';
import { MobileAttendanceController } from './mobileAttendance.controller';
import { MobileAttendanceQueryService } from './mobileAttendanceQuery.service';
import { MobileAuthController } from './mobileAuth.controller';
import { verifyMobileEmployee } from './mobileAuth.middleware';
import { MobileAuthService } from './mobileAuth.service';
import { AttendanceContingencyService } from '../rrhh/services/AttendanceContingencyService';
import { selfieUpload } from './selfieUpload';
import multer from 'multer';

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
const attendanceService = new AsistenciaService(
  new MySqlAsistenciaRepository(),
  new MySqlMarcacionRepository(),
  new MySqlEmpleadoRepository(),
);
const attendanceController = new MobileAttendanceController(
  attendanceService,
  new MobileAttendanceQueryService(),
  new AttendanceContingencyService(attendanceService),
);
const selfieLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Superaste el limite diario de solicitudes con selfie.' },
});
const receiveSelfie = (req: Request, res: Response, next: NextFunction) => {
  selfieUpload.single('selfie')(req, res, (error: unknown) => {
    if (!error) return next();
    const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 422).json({
      ok: false,
      code: tooLarge ? 'SELFIE_TOO_LARGE' : 'INVALID_SELFIE',
      message: tooLarge ? 'La selfie supera el limite de 1.5 MB.' : 'No se pudo procesar la selfie.',
    });
  });
};

router.post('/auth/activate', activationLimiter, authController.activate);
router.post('/auth/refresh', refreshLimiter, authController.refresh);
router.post('/auth/change-password', verifyMobileEmployee, authController.changePassword);
router.post('/auth/logout', verifyMobileEmployee, authController.logout);
router.get('/attendance/today', verifyMobileEmployee, attendanceController.today);
router.post('/attendance/challenge', verifyMobileEmployee, attendanceController.createChallenge);
router.post('/attendance/clock', verifyMobileEmployee, attendanceController.register);
router.post('/attendance/selfie-review', selfieLimiter, verifyMobileEmployee, receiveSelfie, attendanceController.requestSelfieReview);

export default router;
