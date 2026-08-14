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
router.get('/catalogos', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarCatalogos);
router.post('/cargos', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.crearCargo);
router.put('/cargos/:id', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.actualizarCargo);
router.post('/horarios', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.crearHorario);
router.put('/horarios/:id', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.actualizarHorario);
router.patch('/horarios/:id/estado', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.actualizarEstadoHorario);
router.get('/semana-laboral', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerSemanaLaboral);
router.put('/semana-laboral', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.guardarSemanaLaboral);
router.patch('/semana-laboral/heredar', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.heredarSemanaCorporativa);
router.get('/calendario', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarCalendarioLaboral);
router.post('/calendario', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.crearEventoCalendario);
router.patch('/calendario/:id/cancelar', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.cancelarEventoCalendario);
router.post('/empleados', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.crearEmpleado);
router.put('/empleados/:id', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.actualizarEmpleado);
router.get('/empleados/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarEmpleadosSede);
router.delete('/empleados/:id', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.darDeBajaEmpleado);
router.post('/empleados/:id/activacion-dispositivo', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.crearActivacionDispositivo);
router.post('/empleados/:id/revocar-dispositivo', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.revocarDispositivo);
router.get('/empleados/:id/horario', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerHorarioEmpleado);
router.put('/empleados/:id/horario', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.guardarHorarioEmpleado);
router.get('/sedes/:sedeId/geocerca', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerGeocerca);
router.put('/sedes/:sedeId/geocerca', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.guardarGeocerca);

// Endpoints de Asistencia
router.post('/asistencias/marcar', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.marcarAsistencia);
router.get('/asistencias/resumen/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.consultarResumenAsistencia);
router.get('/asistencias/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.consultarAsistenciasSede);
router.put('/asistencias/correccion', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.corregirAsistencia);
router.get('/contingencias/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarContingenciasMarcacion);
router.get('/contingencias/:id/evidencia', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.obtenerEvidenciaContingencia);
router.patch('/contingencias/:id/resolver', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.resolverContingenciaMarcacion);
router.get('/incidencias/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarIncidencias);
router.post('/permisos', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.crearPermiso);
router.patch('/permisos/:id/resolver', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.resolverPermiso);
router.post('/vacaciones', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.crearVacaciones);
router.patch('/vacaciones/:id/resolver', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.resolverVacaciones);

export default router;
