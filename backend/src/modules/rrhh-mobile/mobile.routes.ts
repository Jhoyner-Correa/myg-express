import { NextFunction, Request, Response, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { MySqlAsistenciaRepository } from '../rrhh/repositories/mysql/MySqlAsistenciaRepository';
import { MySqlEmpleadoRepository } from '../rrhh/repositories/mysql/MySqlEmpleadoRepository';
import { MySqlMarcacionRepository } from '../rrhh/repositories/mysql/MySqlMarcacionRepository';
import { AsistenciaService } from '../rrhh/services/AsistenciaService';
import { MobileAttendanceController } from './mobileAttendance.controller';
import { MobileAttendanceQueryService } from './mobileAttendanceQuery.service';
import { MobileAuthController } from './mobileAuth.controller';
import { verifyMobileEmployee, verifyMobileGpsReporter } from './mobileAuth.middleware';
import { MobileAuthService } from './mobileAuth.service';
import { AttendanceContingencyService } from '../rrhh/services/AttendanceContingencyService';
import { selfieUpload } from './selfieUpload';
import multer from 'multer';
import { MobileGpsController } from './mobileGps.controller';
import { MobileNotificationController } from './mobileNotification.controller';
import { MobileProfileController } from './mobileProfile.controller';
import { receiveEmployeePhoto } from '../rrhh/employeePhotoUpload';
import { MobilePermissionRequestController } from './mobilePermissionRequest.controller';
import { receivePermissionEvidence } from './permissionEvidenceUpload';
import { MobileAttendanceJustificationController } from './mobileAttendanceJustification.controller';
import { MobileOvertimeController } from './mobileOvertime.controller';
import { receiveOvertimeEvidence } from './overtimeEvidenceUpload';
import { MobileVersionController } from './mobileVersion.controller';

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
const gpsController = new MobileGpsController();
const notificationController = new MobileNotificationController();
const profileController = new MobileProfileController();
const permissionRequestController = new MobilePermissionRequestController();
const attendanceJustificationController = new MobileAttendanceJustificationController();
const overtimeController = new MobileOvertimeController();
const versionController = new MobileVersionController();
const versionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Demasiadas consultas de version.' },
});
const gpsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Frecuencia de ubicacion excedida.' },
});
const nativeGpsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 720,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Frecuencia de ubicacion excedida.' },
});
const selfieLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Superaste el limite diario de solicitudes con selfie.' },
});
const profilePhotoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Superaste el limite de cambios de foto. Intenta mas tarde.' },
});
const permissionRequestLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: 'RATE_LIMITED', message: 'Superaste el limite diario de solicitudes.' },
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

router.get('/version-policy', versionLimiter, versionController.policy);
router.post('/auth/pre-activate', activationLimiter, authController.preActivate);
router.post('/auth/activate', activationLimiter, authController.activate);
router.post('/auth/refresh', refreshLimiter, authController.refresh);
router.post('/auth/change-password', verifyMobileEmployee, authController.changePassword);
router.post('/auth/logout', verifyMobileEmployee, authController.logout);
router.get('/attendance/today', verifyMobileEmployee, attendanceController.today);
router.get('/attendance/history', verifyMobileEmployee, attendanceController.history);
router.post('/attendance/challenge', verifyMobileEmployee, attendanceController.createChallenge);
router.post('/attendance/clock', verifyMobileEmployee, attendanceController.register);
router.post('/attendance/selfie-review', selfieLimiter, verifyMobileEmployee, receiveSelfie, attendanceController.requestSelfieReview);
router.post('/attendance/overtime', permissionRequestLimiter, verifyMobileEmployee, receiveOvertimeEvidence, overtimeController.create);
router.post('/gps/position', gpsLimiter, verifyMobileEmployee, gpsController.reportPosition);
router.post('/gps/tracking-session', verifyMobileEmployee, gpsController.issueTrackingCredential);
router.post('/gps/native/position', nativeGpsLimiter, verifyMobileGpsReporter, gpsController.reportPosition);
router.get('/notifications', verifyMobileEmployee, notificationController.list);
router.post('/notifications/read-all', verifyMobileEmployee, notificationController.markAllRead);
router.post('/notifications/:id/read', verifyMobileEmployee, notificationController.markRead);
router.get('/requests/permissions', verifyMobileEmployee, permissionRequestController.list);
router.post(
  '/requests/permissions',
  permissionRequestLimiter,
  verifyMobileEmployee,
  receivePermissionEvidence,
  permissionRequestController.create,
);
router.post('/requests/permissions/:id/cancel', verifyMobileEmployee, permissionRequestController.cancel);
router.post(
  '/requests/attendance-justifications',
  permissionRequestLimiter,
  verifyMobileEmployee,
  receivePermissionEvidence,
  attendanceJustificationController.create,
);
router.post('/requests/attendance-justifications/:id/cancel', verifyMobileEmployee, attendanceJustificationController.cancel);
router.post(
  '/profile/photo',
  profilePhotoLimiter,
  verifyMobileEmployee,
  receiveEmployeePhoto,
  profileController.updatePhoto,
);

export default router;
