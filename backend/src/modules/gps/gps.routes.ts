// ============================================================
// backend/src/modules/gps/gps.routes.ts
// Rutas de la API del módulo GPS de rastreo
// ============================================================

import { Router } from 'express';
import { GpsController } from './gps.controller';
import { GpsService } from './services/GpsService';
import { MySqlGpsRepository } from './repositories/mysql/MySqlGpsRepository';
import { verificarToken } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/permissionMiddleware';
import { PERMISSIONS } from '../../core/constants/permissions';

const router = Router();

// Inyección manual de dependencias
const gpsRepository = new MySqlGpsRepository();
const gpsService = new GpsService(gpsRepository);
const gpsController = new GpsController(gpsService);

// Endpoints GPS
router.use(verificarToken);
router.post('/reportar', requirePermission(PERMISSIONS.GPS_MANAGE), gpsController.reportarUbicacion);
router.get('/tiempo-real', requirePermission(PERMISSIONS.GPS_VIEW), gpsController.obtenerTiempoRealCorporativo);
router.get('/tiempo-real/sede/:sedeId', requirePermission(PERMISSIONS.GPS_VIEW), gpsController.obtenerTiempoReal);
router.get('/historial/empleado/:empleadoId', requirePermission(PERMISSIONS.GPS_VIEW), gpsController.obtenerHistorial);

export default router;
