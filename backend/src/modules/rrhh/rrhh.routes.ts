// ============================================================
// backend/src/modules/rrhh/rrhh.routes.ts
// Rutas de la API del módulo de Recursos Humanos (RRHH)
// ============================================================

import { Router } from 'express';
import { RrhhController } from './rrhh.controller';
import { EmpleadoService } from './services/EmpleadoService';
import { AsistenciaService } from './services/AsistenciaService';
import { MySqlEmpleadoRepository } from './repositories/mysql/MySqlEmpleadoRepository';
import { MySqlAsistenciaRepository } from './repositories/mysql/MySqlAsistenciaRepository';
import { MySqlMarcacionRepository } from './repositories/mysql/MySqlMarcacionRepository';
import { verificarToken } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/permissionMiddleware';
import { PERMISSIONS } from '../../core/constants/permissions';

const router = Router();

// Inyección manual de dependencias
const empleadoRepository = new MySqlEmpleadoRepository();
const asistenciaRepository = new MySqlAsistenciaRepository();
const marcacionRepository = new MySqlMarcacionRepository();

const empleadoService = new EmpleadoService(empleadoRepository);
const asistenciaService = new AsistenciaService(
  asistenciaRepository,
  marcacionRepository,
  empleadoRepository
);

const rrhhController = new RrhhController(empleadoService, asistenciaService);

// Endpoints de Empleados
router.use(verificarToken);
router.post('/empleados', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.crearEmpleado);
router.put('/empleados/:id', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.actualizarEmpleado);
router.get('/empleados/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarEmpleadosSede);
router.delete('/empleados/:id', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.darDeBajaEmpleado);
router.post('/empleados/:id/activacion-dispositivo', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.crearActivacionDispositivo);
router.post('/empleados/:id/revocar-dispositivo', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.revocarDispositivo);
router.get('/sedes/:sedeId/geocerca', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerGeocerca);
router.put('/sedes/:sedeId/geocerca', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.guardarGeocerca);

// Endpoints de Asistencia
router.post('/asistencias/marcar', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.marcarAsistencia);
router.get('/asistencias/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.consultarAsistenciasSede);

export default router;
