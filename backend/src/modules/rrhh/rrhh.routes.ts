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
import rateLimit from 'express-rate-limit';
import { receiveEmployeePhoto } from './employeePhotoUpload';
import { ServicePaymentController } from './servicePayment.controller';

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
const servicePaymentController = new ServicePaymentController();
const dniLookupLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, code: 'DNI_LOOKUP_RATE_LIMIT', message: 'Demasiadas consultas de DNI. Espera un momento.' },
});
const employeePhotoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, code: 'EMPLOYEE_PHOTO_RATE_LIMIT', message: 'Demasiados cambios de foto. Intenta nuevamente mas tarde.' },
});
const holidaySyncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, code: 'HOLIDAY_SYNC_RATE_LIMIT', message: 'Se alcanzó el límite de sincronizaciones. Intenta más tarde.' },
});

// Endpoints de Empleados
router.use(verificarToken);
router.post('/identidad/dni/consultar', dniLookupLimiter, requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.consultarDni);
router.get('/catalogos', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarCatalogos);
router.post('/cargos', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.crearCargo);
router.put('/cargos/:id', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.actualizarCargo);
router.post('/horarios', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.crearHorario);
router.put('/horarios/:id', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.actualizarHorario);
router.patch('/horarios/:id/estado', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.actualizarEstadoHorario);
router.get('/semana-laboral', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerSemanaLaboral);
router.put('/semana-laboral', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.guardarSemanaLaboral);
router.patch('/semana-laboral/heredar', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.heredarSemanaCorporativa);
router.get('/calendario/propuestas', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarPropuestasFeriados);
router.post('/calendario/propuestas/sincronizar', holidaySyncLimiter, requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.sincronizarPropuestasFeriados);
router.patch('/calendario/propuestas/:id/decision', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.resolverPropuestaFeriado);
router.get('/calendario', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarCalendarioLaboral);
router.post('/calendario', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.crearEventoCalendario);
router.patch('/calendario/:id/cancelar', requirePermission(PERMISSIONS.RRHH_CONFIGURE), rrhhController.cancelarEventoCalendario);
router.post('/empleados', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.crearEmpleado);
router.get('/empleados', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarEmpleados);
router.get('/empleados/:id/perfil-operativo', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerPerfilOperativoEmpleado);
router.patch('/empleados/:id/estado', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.actualizarEstadoEmpleado);
router.put('/empleados/:id/foto', employeePhotoLimiter, requirePermission(PERMISSIONS.RRHH_MANAGE), receiveEmployeePhoto, rrhhController.actualizarFotoEmpleado);
router.delete('/empleados/:id/foto', employeePhotoLimiter, requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.eliminarFotoEmpleado);
router.put('/empleados/:id', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.actualizarEmpleado);
router.get('/empleados/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarEmpleados);
router.delete('/empleados/:id', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.darDeBajaEmpleado);
router.post('/empleados/:id/activacion-dispositivo', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.crearActivacionDispositivo);
router.post('/empleados/:id/revocar-dispositivo', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.revocarDispositivo);
router.get('/empleados/:id/horario', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerHorarioEmpleado);
router.put('/empleados/:id/horario', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.guardarHorarioEmpleado);
router.get('/sedes/:sedeId/geocerca', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerGeocerca);
router.put('/sedes/:sedeId/geocerca', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.guardarGeocerca);

// Endpoints de Asistencia
router.post('/asistencias/marcar', requirePermission(PERMISSIONS.RRHH_MANAGE), rrhhController.marcarAsistencia);
router.get('/asistencias/resumen', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.consultarResumenAsistencia);
router.get('/asistencias/resumen/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.consultarResumenAsistencia);
router.get('/asistencias/tendencia', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.consultarTendenciaAsistencia);
router.get('/asistencias/empleado/:employeeId/reporte', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerReporteAsistenciaEmpleado);
router.get('/asistencias/detalle', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerDetalleAsistencia);
router.get('/asistencias/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.consultarAsistenciasSede);
router.put('/asistencias/correccion', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.corregirAsistencia);
router.post('/asistencias/incidencias/resolver', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.resolverIncidenciaAsistencia);
router.patch('/sobretiempo/:id/resolver', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.resolverSobretiempo);
router.get('/sobretiempo/:id/sustento', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerSustentoSobretiempo);
router.get('/contingencias', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarContingenciasMarcacion);
router.get('/contingencias/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarContingenciasMarcacion);
router.get('/contingencias/:id/evidencia', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.obtenerEvidenciaContingencia);
router.patch('/contingencias/:id/resolver', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.resolverContingenciaMarcacion);
router.get('/incidencias', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarIncidencias);
router.get('/incidencias/sede/:sedeId', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.listarIncidencias);
router.post('/permisos', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.crearPermiso);
router.get('/permisos/:id/sustento', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerSustentoPermiso);
router.patch('/permisos/:id/resolver', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.resolverPermiso);
router.patch('/permisos/:id/cancelar', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.cancelarPermiso);
router.get('/justificaciones/:id/sustento', requirePermission(PERMISSIONS.RRHH_VIEW), rrhhController.obtenerSustentoJustificacion);
router.patch('/justificaciones/:id/resolver', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.resolverJustificacionAsistencia);
router.post('/vacaciones', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.crearVacaciones);
router.patch('/vacaciones/:id/resolver', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.resolverVacaciones);
router.patch('/vacaciones/:id/cancelar', requirePermission(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), rrhhController.cancelarVacaciones);

// Pagos mensuales por servicios (Recibos por Honorarios)
router.get('/pagos', requirePermission(PERMISSIONS.RRHH_PAYMENTS_VIEW), servicePaymentController.dashboard);
router.get('/pagos/historial', requirePermission(PERMISSIONS.RRHH_PAYMENTS_VIEW), servicePaymentController.history);
router.get('/pagos/empleados/:id/expediente', requirePermission(PERMISSIONS.RRHH_PAYMENTS_VIEW), servicePaymentController.employeeLedger);
router.post('/pagos/empleados/:id/notas', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.addEmployeeNote);
router.patch('/pagos/notas/:id/anular', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.cancelEmployeeNote);
router.post('/pagos/periodos/generar', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.generate);
router.post('/pagos/periodos/:id/transicion', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.transitionPeriod);
router.post('/pagos/periodos/:id/lotes', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.createBatch);
router.put('/pagos/empleados/:id/acuerdo', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.saveAgreement);
router.post('/pagos/movimientos', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.createMovement);
router.post('/pagos/prestamos', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.createLoan);
router.put('/pagos/liquidaciones/:id/recibo', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.registerReceipt);
router.post('/pagos/liquidaciones/:id/deposito', requirePermission(PERMISSIONS.RRHH_PAYMENTS_MANAGE), servicePaymentController.markPaid);

export default router;
