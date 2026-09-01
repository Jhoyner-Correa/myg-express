// ============================================================
// backend/src/modules/rrhh/rrhh.controller.ts
// Controlador HTTP para operaciones de Recursos Humanos (RRHH)
// ============================================================

import { Response } from 'express';
import { EmpleadoService } from './services/EmpleadoService';
import { AsistenciaService } from './services/AsistenciaService';
import { ClockType, ClockOrigin } from './domain/Marcacion';
import { EmployeeGender, EmployeeTracking, EmployeeStatus } from './domain/Empleado';
import { AuthRequest } from '../../core/middlewares/authMiddleware';
import { assertEntitySede, resolveOptionalSedeScope, resolveSedeScope, SedeScopeError } from '../../core/auth/sedeScope';
import { businessDate } from '../../core/utils/time';
import { randomUUID } from 'crypto';
import { AttendanceRuleError } from './domain/attendancePolicy';
import { MobileAuthService, mobileAuthCode, mobileAuthStatus } from '../rrhh-mobile/mobileAuth.service';
import { GeofenceService } from './services/GeofenceService';
import { RrhhCatalogService } from './services/RrhhCatalogService';
import { AttendanceDashboardService } from './services/AttendanceDashboardService';
import { AbsenceWorkflowService } from './services/AbsenceWorkflowService';
import { AttendanceCorrectionService } from './services/AttendanceCorrectionService';
import { AttendanceContingencyService, ContingencyError } from './services/AttendanceContingencyService';
import { ScheduleService } from './services/ScheduleService';
import { WorkCalendarService } from './services/WorkCalendarService';
import { HolidayCalendarService } from './services/HolidayCalendarService';
import { HolidayProviderError } from './services/HolidayProvider';
import { DniLookupError, DniLookupService } from './services/DniLookupService';
import { EmployeeOperationalProfileService, EmployeeProfileError } from './services/EmployeeOperationalProfileService';
import { EmployeePhotoError, EmployeePhotoStorageService } from './services/EmployeePhotoStorageService';
import { AttendanceManagementService } from './services/AttendanceManagementService';

function errorStatus(error: unknown, fallback: number): number {
  if (error instanceof SedeScopeError || error instanceof AttendanceRuleError) return error.statusCode;
  return fallback;
}

function companyScope(req: AuthRequest): number | null {
  if (req.user?.alcance === 'SISTEMA') return null;
  const companyId = Number(req.user?.empresa_id);
  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new SedeScopeError('Usuario empresarial sin empresa asignada');
  }
  return companyId;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export class RrhhController {
  private readonly mobileAuthService = new MobileAuthService();
  private readonly geofenceService = new GeofenceService();
  private readonly catalogService = new RrhhCatalogService();
  private readonly attendanceDashboardService = new AttendanceDashboardService();
  private readonly absenceWorkflowService = new AbsenceWorkflowService();
  private readonly attendanceCorrectionService = new AttendanceCorrectionService();
  private readonly scheduleService = new ScheduleService();
  private readonly workCalendarService = new WorkCalendarService();
  private readonly holidayCalendarService = new HolidayCalendarService();
  private readonly dniLookupService = new DniLookupService();
  private readonly employeeProfileService = new EmployeeOperationalProfileService();
  private readonly employeePhotoStorageService = new EmployeePhotoStorageService();
  private readonly attendanceContingencyService: AttendanceContingencyService;
  private readonly attendanceManagementService = new AttendanceManagementService();

  constructor(
    private empleadoService: EmpleadoService,
    private asistenciaService: AsistenciaService
  ) {
    this.attendanceContingencyService = new AttendanceContingencyService(asistenciaService);
  }

  listarCatalogos = async (req: AuthRequest, res: Response) => {
    try {
      const scopedSite = req.user?.sede_id ? Number(req.user.sede_id) : null;
      const [sites, roles, schedules, geofences] = await Promise.all([
        this.catalogService.listSites(scopedSite, companyScope(req)),
        this.catalogService.listJobRoles(),
        this.scheduleService.listSchedules(),
        this.geofenceService.list(scopedSite, companyScope(req)),
      ]);
      return res.json({ ok: true, data: { sites, roles, schedules, geofences } });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudieron consultar los catálogos.',
      });
    }
  };

  consultarDni = async (req: AuthRequest, res: Response) => {
    try {
      const result = await this.dniLookupService.lookup(String(req.body.dni ?? ''));
      return res.json({ ok: true, data: result });
    } catch (error) {
      const statusCode = error instanceof DniLookupError ? error.statusCode : 503;
      return res.status(statusCode).json({
        ok: false,
        code: error instanceof DniLookupError ? error.code : 'DNI_LOOKUP_ERROR',
        message: error instanceof Error ? error.message : 'No se pudo consultar el DNI.',
      });
    }
  };

  crearCargo = async (req: AuthRequest, res: Response) => {
    try {
      const role = await this.catalogService.saveJobRole(null, {
        name: req.body.name,
        description: req.body.description,
        defaultTrackingType: req.body.default_tracking_type,
      }, Number(req.user?.id));
      return res.status(201).json({ ok: true, message: 'Cargo creado correctamente.', data: role });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo crear el cargo.' });
    }
  };

  actualizarCargo = async (req: AuthRequest, res: Response) => {
    try {
      const roleId = Number(req.params.id);
      if (!Number.isInteger(roleId) || roleId < 1) throw new Error('Cargo no válido.');
      const role = await this.catalogService.saveJobRole(roleId, {
        name: req.body.name,
        description: req.body.description,
        defaultTrackingType: req.body.default_tracking_type,
      }, Number(req.user?.id));
      return res.json({ ok: true, message: 'Cargo actualizado correctamente.', data: role });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo actualizar el cargo.' });
    }
  };

  crearHorario = async (req: AuthRequest, res: Response) => {
    try {
      const schedule = await this.scheduleService.saveSchedule(null, {
        name: req.body.name,
        startTime: req.body.start_time,
        endTime: req.body.end_time,
        toleranceMinutes: req.body.tolerance_minutes,
        lunchEnabled: req.body.lunch_enabled,
        lunchStartFrom: req.body.lunch_start_from,
        lunchStartUntil: req.body.lunch_start_until,
        lunchDurationMinutes: req.body.lunch_duration_minutes,
        returnToleranceMinutes: req.body.return_tolerance_minutes,
        entryOpenBeforeMinutes: req.body.entry_open_before_minutes,
        lunchOpenBeforeMinutes: req.body.lunch_open_before_minutes,
        returnOpenBeforeMinutes: req.body.return_open_before_minutes,
        exitOpenBeforeMinutes: req.body.exit_open_before_minutes,
        overtimeThresholdMinutes: req.body.overtime_threshold_minutes,
        effectiveFrom: req.body.effective_from,
      }, Number(req.user?.id));
      return res.status(201).json({ ok: true, message: 'Horario creado correctamente.', data: schedule });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo crear el horario.' });
    }
  };

  actualizarHorario = async (req: AuthRequest, res: Response) => {
    try {
      const scheduleId = Number(req.params.id);
      if (!Number.isInteger(scheduleId) || scheduleId < 1) throw new Error('Horario no válido.');
      const schedule = await this.scheduleService.saveSchedule(scheduleId, {
        name: req.body.name,
        startTime: req.body.start_time,
        endTime: req.body.end_time,
        toleranceMinutes: req.body.tolerance_minutes,
        lunchEnabled: req.body.lunch_enabled,
        lunchStartFrom: req.body.lunch_start_from,
        lunchStartUntil: req.body.lunch_start_until,
        lunchDurationMinutes: req.body.lunch_duration_minutes,
        returnToleranceMinutes: req.body.return_tolerance_minutes,
        entryOpenBeforeMinutes: req.body.entry_open_before_minutes,
        lunchOpenBeforeMinutes: req.body.lunch_open_before_minutes,
        returnOpenBeforeMinutes: req.body.return_open_before_minutes,
        exitOpenBeforeMinutes: req.body.exit_open_before_minutes,
        overtimeThresholdMinutes: req.body.overtime_threshold_minutes,
        effectiveFrom: req.body.effective_from,
      }, Number(req.user?.id));
      return res.json({ ok: true, message: 'Horario actualizado correctamente.', data: schedule });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo actualizar el horario.' });
    }
  };

  actualizarEstadoHorario = async (req: AuthRequest, res: Response) => {
    try {
      const scheduleId = Number(req.params.id);
      if (!Number.isInteger(scheduleId) || scheduleId < 1) throw new Error('Horario no válido.');
      const schedule = await this.scheduleService.setScheduleStatus(
        scheduleId,
        req.body.status,
        Number(req.user?.id),
      );
      return res.json({ ok: true, message: 'Estado del horario actualizado.', data: schedule });
    } catch (error) {
      return res.status(400).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo actualizar el horario.' });
    }
  };

  obtenerSemanaLaboral = async (req: AuthRequest, res: Response) => {
    try {
      const scope = String(req.query.alcance || '').toUpperCase();
      if (scope === 'EMPRESA' && req.user?.alcance === 'SEDE') {
        throw new SedeScopeError('No tienes permiso para consultar la política corporativa.');
      }
      const siteId = scope === 'SEDE' ? resolveSedeScope(req, req.query.sede_id) : null;
      const data = await this.scheduleService.getWeeklyPolicy(
        scope,
        siteId,
        req.query.fecha || businessDate(),
      );
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar la semana laboral.',
      });
    }
  };

  guardarSemanaLaboral = async (req: AuthRequest, res: Response) => {
    try {
      const scope = String(req.body.scope || '').toUpperCase();
      if (scope === 'EMPRESA' && req.user?.alcance === 'SEDE') {
        throw new SedeScopeError('No tienes permiso para modificar la política corporativa.');
      }
      const siteId = scope === 'SEDE' ? resolveSedeScope(req, req.body.site_id) : null;
      const assignments = Array.isArray(req.body.assignments)
        ? req.body.assignments.map((value: unknown) => {
          const assignment = value as Record<string, unknown>;
          return { weekday: Number(assignment.weekday), scheduleId: Number(assignment.schedule_id) };
        })
        : [];
      const data = await this.scheduleService.replaceWeeklyPolicy(
        scope,
        siteId,
        assignments,
        req.body.effective_from,
        Number(req.user?.id),
      );
      return res.json({ ok: true, message: 'Semana laboral programada correctamente.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo guardar la semana laboral.',
      });
    }
  };

  heredarSemanaCorporativa = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.site_id);
      const data = await this.scheduleService.inheritCompanyWeeklyPolicy(
        siteId,
        req.body.effective_from,
        Number(req.user?.id),
      );
      return res.json({ ok: true, message: 'La sede usará la semana laboral corporativa.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo heredar la política corporativa.',
      });
    }
  };

  listarCalendarioLaboral = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveOptionalSedeScope(req, req.query.sede_id);
      const year = Number(String(req.query.desde || businessDate()).slice(0, 4));
      const from = req.query.desde || `${year}-01-01`;
      const until = req.query.hasta || `${year}-12-31`;
      const data = await this.workCalendarService.list(siteId, from, until);
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar el calendario laboral.',
      });
    }
  };

  crearEventoCalendario = async (req: AuthRequest, res: Response) => {
    try {
      const scope = String(req.body.scope || '').toUpperCase();
      if (scope === 'EMPRESA' && req.user?.alcance === 'SEDE') {
        throw new SedeScopeError('No tienes permiso para configurar el calendario corporativo.');
      }
      const siteId = scope === 'SEDE' ? resolveSedeScope(req, req.body.site_id) : null;
      const data = await this.workCalendarService.create({
        scope,
        siteId,
        name: req.body.name,
        type: req.body.type,
        startDate: req.body.start_date,
        endDate: req.body.end_date,
        scheduleId: req.body.schedule_id,
        description: req.body.description,
      }, Number(req.user?.id));
      return res.status(201).json({ ok: true, message: 'Evento agregado al calendario laboral.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo crear el evento.',
      });
    }
  };

  cancelarEventoCalendario = async (req: AuthRequest, res: Response) => {
    try {
      const eventId = Number(req.params.id);
      if (!Number.isInteger(eventId) || eventId < 1) throw new Error('Evento no valido.');
      const scopedSiteId = req.user?.alcance === 'SEDE' ? Number(req.user.sede_id) : null;
      const data = await this.workCalendarService.cancel(eventId, Number(req.user?.id), scopedSiteId);
      return res.json({ ok: true, message: 'Evento cancelado. Su historial fue conservado.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo cancelar el evento.',
      });
    }
  };

  listarPropuestasFeriados = async (req: AuthRequest, res: Response) => {
    try {
      const data = await this.holidayCalendarService.list(req.query.anio || new Date().getFullYear());
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudieron consultar las propuestas de feriados.',
      });
    }
  };

  sincronizarPropuestasFeriados = async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.alcance === 'SEDE') {
        throw new SedeScopeError('La sincronización de feriados es una función corporativa.');
      }
      const data = await this.holidayCalendarService.synchronize(
        req.body.year || new Date().getFullYear(),
        Number(req.user?.id),
      );
      return res.json({ ok: true, message: 'Feriados importados para revisión administrativa.', data });
    } catch (error) {
      const statusCode = error instanceof HolidayProviderError
        ? error.statusCode
        : errorStatus(error, 400);
      return res.status(statusCode).json({
        ok: false,
        code: error instanceof HolidayProviderError ? error.code : undefined,
        message: error instanceof Error ? error.message : 'No se pudieron sincronizar los feriados.',
      });
    }
  };

  resolverPropuestaFeriado = async (req: AuthRequest, res: Response) => {
    try {
      const proposalId = Number(req.params.id);
      if (!Number.isInteger(proposalId) || proposalId < 1) throw new Error('Propuesta no válida.');
      const scope = String(req.body.scope || 'EMPRESA').toUpperCase();
      if (scope === 'EMPRESA' && req.user?.alcance === 'SEDE') {
        throw new SedeScopeError('No tienes permiso para definir una regla corporativa.');
      }
      const siteId = scope === 'SEDE' ? resolveSedeScope(req, req.body.site_id) : null;
      const data = await this.holidayCalendarService.decide(proposalId, {
        decision: req.body.decision,
        scope,
        siteId,
        scheduleId: req.body.schedule_id,
        comment: req.body.comment,
      }, Number(req.user?.id));
      return res.json({ ok: true, message: 'Decisión laboral registrada con trazabilidad.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo resolver la propuesta.',
      });
    }
  };

  obtenerHorarioEmpleado = async (req: AuthRequest, res: Response) => {
    try {
      const employeeId = Number(req.params.id);
      const employee = await this.empleadoService.obtenerPorId(employeeId);
      assertEntitySede(req, employee.sedeId);
      return res.json({
        ok: true,
        data: await this.scheduleService.getEmployeeSchedule(employeeId, req.query.fecha),
      });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo consultar el horario.' });
    }
  };

  guardarHorarioEmpleado = async (req: AuthRequest, res: Response) => {
    try {
      const employeeId = Number(req.params.id);
      const employee = await this.empleadoService.obtenerPorId(employeeId);
      assertEntitySede(req, employee.sedeId);
      const assignments = Array.isArray(req.body.assignments)
        ? req.body.assignments.map((value: unknown) => {
          const assignment = value as Record<string, unknown>;
          return {
            weekday: Number(assignment.weekday),
            scheduleId: Number(assignment.schedule_id),
          };
        })
        : [];
      const data = await this.scheduleService.replaceEmployeeSchedule(
        employeeId,
        assignments,
        req.body.effective_from,
        Number(req.user?.id),
      );
      return res.json({ ok: true, message: 'Horario semanal actualizado.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo guardar el horario.' });
    }
  };

  crearEmpleado = async (req: AuthRequest, res: Response) => {
    try {
      const {
        sede_id,
        cargo_id,
        dni,
        ruc,
        nombres,
        apellidos,
        sexo,
        telefono,
        email,
        direccion,
        fecha_ingreso,
        tipo_rastreo,
        estado,
        observaciones
      } = req.body;

      if (!sede_id || !cargo_id || !dni || !nombres || !apellidos || !sexo || !fecha_ingreso || !optionalText(direccion)) {
        return res.status(400).json({
          ok: false,
          message: 'Faltan campos obligatorios, incluida la direccion domiciliaria'
        });
      }

      const sedeId = resolveSedeScope(req, sede_id);
      const nuevoEmpleado = await this.empleadoService.registrarEmpleado({
        sedeId,
        cargoId: Number(cargo_id),
        dni: String(dni).trim(),
        ruc: optionalText(ruc),
        nombres: String(nombres).trim(),
        apellidos: String(apellidos).trim(),
        sexo: sexo as EmployeeGender,
        telefono: optionalText(telefono),
        email: optionalText(email)?.toLowerCase() ?? null,
        direccion: String(direccion).trim(),
        foto: null,
        fechaIngreso: new Date(fecha_ingreso),
        fechaCese: null,
        tipoRastreo: (tipo_rastreo as EmployeeTracking) || 'SOLO_MARCACION',
        estado: (estado as EmployeeStatus) || 'ACTIVO',
        observaciones: observaciones || null
      });

      return res.status(201).json({
        ok: true,
        message: `Empleado registrado con el código ${nuevoEmpleado.codigoEmpleado}`,
        data: nuevoEmpleado
      });
    } catch (error: any) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error.message
      });
    }
  };

  crearActivacionDispositivo = async (req: AuthRequest, res: Response) => {
    try {
      const employeeId = Number(req.params.id);
      const employee = await this.empleadoService.obtenerPorId(employeeId);
      assertEntitySede(req, employee.sedeId);
      const activation = await this.mobileAuthService.createActivation(
        employeeId,
        Number(req.user?.id),
        String(req.body.password || ''),
        req.body.replace_existing_device === true,
      );
      return res.status(201).json({
        ok: true,
        message: 'Acceso movil configurado. La contrasena se muestra una sola vez.',
        data: activation,
      });
    } catch (error) {
      return res.status(error instanceof SedeScopeError ? error.statusCode : mobileAuthStatus(error)).json({
        ok: false,
        code: mobileAuthCode(error),
        message: error instanceof Error ? error.message : 'No se pudo generar la activacion.',
      });
    }
  };

  revocarDispositivo = async (req: AuthRequest, res: Response) => {
    try {
      const employeeId = Number(req.params.id);
      const employee = await this.empleadoService.obtenerPorId(employeeId);
      assertEntitySede(req, employee.sedeId);
      await this.mobileAuthService.revokeEmployeeDevice(
        employeeId,
        Number(req.user?.id),
        String(req.body.motivo || ''),
        req.ip,
      );
      return res.json({ ok: true, message: 'Celular y sesiones revocados correctamente.' });
    } catch (error) {
      return res.status(error instanceof SedeScopeError ? error.statusCode : mobileAuthStatus(error)).json({
        ok: false,
        code: mobileAuthCode(error),
        message: error instanceof Error ? error.message : 'No se pudo revocar el dispositivo.',
      });
    }
  };

  obtenerGeocerca = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.params.sedeId);
      return res.json({ ok: true, data: await this.geofenceService.getBySite(siteId) });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo consultar la geocerca.' });
    }
  };

  guardarGeocerca = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.params.sedeId);
      const geofence = await this.geofenceService.upsert(siteId, {
        latitude: Number(req.body.latitude),
        longitude: Number(req.body.longitude),
        radiusMeters: Number(req.body.radius_meters),
        maximumAccuracyMeters: Number(req.body.maximum_accuracy_meters),
      }, Number(req.user?.id), req.ip, {
        method: req.body.capture_method === 'DEVICE_GPS' ? 'DEVICE_GPS' : 'MANUAL',
        accuracyMeters: req.body.capture_method === 'DEVICE_GPS'
          ? Number(req.body.capture_accuracy_meters) || null
          : null,
      });
      return res.json({ ok: true, message: 'Geocerca actualizada correctamente.', data: geofence });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo guardar la geocerca.' });
    }
  };

  actualizarEmpleado = async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const datos = req.body;
      const empleadoExistente = await this.empleadoService.obtenerPorId(id);
      assertEntitySede(req, empleadoExistente.sedeId);
      if (datos.estado !== undefined && datos.estado !== empleadoExistente.estado) {
        return res.status(409).json({
          ok: false,
          code: 'EMPLOYEE_STATUS_REQUIRES_REASON',
          message: 'El estado laboral se administra desde el perfil del colaborador e indicando un motivo.',
        });
      }

      // Mapear campos snake_case a camelCase si existen en la petición
      const mappedDatos: any = {};
      if (datos.sede_id !== undefined) mappedDatos.sedeId = resolveSedeScope(req, datos.sede_id);
      if (datos.cargo_id !== undefined) mappedDatos.cargoId = Number(datos.cargo_id);
      if (datos.dni !== undefined) mappedDatos.dni = datos.dni;
      if (datos.ruc !== undefined) mappedDatos.ruc = optionalText(datos.ruc);
      if (datos.nombres !== undefined) mappedDatos.nombres = datos.nombres;
      if (datos.apellidos !== undefined) mappedDatos.apellidos = datos.apellidos;
      if (datos.sexo !== undefined) mappedDatos.sexo = datos.sexo;
      if (datos.telefono !== undefined) mappedDatos.telefono = optionalText(datos.telefono);
      if (datos.email !== undefined) mappedDatos.email = optionalText(datos.email)?.toLowerCase() ?? null;
      if (datos.direccion !== undefined) mappedDatos.direccion = optionalText(datos.direccion) ?? '';
      if (datos.fecha_ingreso !== undefined) mappedDatos.fechaIngreso = new Date(datos.fecha_ingreso);
      if (datos.fecha_cese !== undefined) mappedDatos.fechaCese = datos.fecha_cese ? new Date(datos.fecha_cese) : null;
      if (datos.tipo_rastreo !== undefined) mappedDatos.tipoRastreo = datos.tipo_rastreo;
      if (datos.estado !== undefined) mappedDatos.estado = datos.estado;
      if (datos.observaciones !== undefined) mappedDatos.observaciones = datos.observaciones;

      const empleadoActualizado = await this.empleadoService.actualizarEmpleado(id, mappedDatos);

      return res.json({
        ok: true,
        message: 'Empleado actualizado con éxito',
        data: empleadoActualizado
      });
    } catch (error: any) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error.message
      });
    }
  };

  actualizarFotoEmpleado = async (req: AuthRequest, res: Response) => {
    let newPhotoUrl: string | null = null;
    try {
      const employeeId = Number(req.params.id);
      if (!Number.isInteger(employeeId) || employeeId < 1) {
        throw new EmployeePhotoError('INVALID_EMPLOYEE_ID', 'Colaborador no valido.', 400);
      }
      if (!req.file) {
        throw new EmployeePhotoError('EMPLOYEE_PHOTO_REQUIRED', 'Selecciona una foto para continuar.');
      }

      const employee = await this.empleadoService.obtenerPorId(employeeId);
      assertEntitySede(req, employee.sedeId);
      newPhotoUrl = await this.employeePhotoStorageService.save(req.file.buffer, req.file.mimetype);
      const updated = await this.empleadoService.actualizarEmpleado(employeeId, { foto: newPhotoUrl });

      try {
        await this.employeePhotoStorageService.removeManaged(employee.foto);
      } catch (cleanupError) {
        console.warn('No se pudo eliminar la foto anterior del colaborador:', cleanupError);
      }
      await this.employeeProfileService.recordProfilePhotoChange(
        employeeId, 'UPDATED', Number(req.user?.id), req.ip,
      ).catch(auditError => console.warn('No se pudo auditar el cambio de foto:', auditError));
      return res.json({ ok: true, message: 'Foto de perfil actualizada correctamente.', data: updated });
    } catch (error) {
      if (newPhotoUrl) await this.employeePhotoStorageService.removeManaged(newPhotoUrl).catch(() => undefined);
      const statusCode = error instanceof EmployeePhotoError ? error.statusCode : errorStatus(error, 400);
      return res.status(statusCode).json({
        ok: false,
        code: error instanceof EmployeePhotoError ? error.code : 'EMPLOYEE_PHOTO_UPDATE_ERROR',
        message: error instanceof Error ? error.message : 'No se pudo actualizar la foto del colaborador.',
      });
    }
  };

  eliminarFotoEmpleado = async (req: AuthRequest, res: Response) => {
    try {
      const employeeId = Number(req.params.id);
      if (!Number.isInteger(employeeId) || employeeId < 1) {
        throw new EmployeePhotoError('INVALID_EMPLOYEE_ID', 'Colaborador no valido.', 400);
      }
      const employee = await this.empleadoService.obtenerPorId(employeeId);
      assertEntitySede(req, employee.sedeId);
      const updated = await this.empleadoService.actualizarEmpleado(employeeId, { foto: null });
      try {
        await this.employeePhotoStorageService.removeManaged(employee.foto);
      } catch (cleanupError) {
        console.warn('No se pudo eliminar el archivo de la foto del colaborador:', cleanupError);
      }
      await this.employeeProfileService.recordProfilePhotoChange(
        employeeId, 'REMOVED', Number(req.user?.id), req.ip,
      ).catch(auditError => console.warn('No se pudo auditar la eliminacion de foto:', auditError));
      return res.json({ ok: true, message: 'Foto de perfil eliminada correctamente.', data: updated });
    } catch (error) {
      const statusCode = error instanceof EmployeePhotoError ? error.statusCode : errorStatus(error, 400);
      return res.status(statusCode).json({
        ok: false,
        code: error instanceof EmployeePhotoError ? error.code : 'EMPLOYEE_PHOTO_DELETE_ERROR',
        message: error instanceof Error ? error.message : 'No se pudo eliminar la foto del colaborador.',
      });
    }
  };

  listarEmpleados = async (req: AuthRequest, res: Response) => {
    try {
      const requestedSite = req.query.sede_id ?? req.params.sedeId;
      const sedeId = resolveOptionalSedeScope(req, requestedSite);
      const empleados = await this.empleadoService.listarDirectorio(sedeId, companyScope(req));
      return res.json({
        ok: true,
        data: empleados
      });
    } catch (error: any) {
      return res.status(errorStatus(error, 500)).json({
        ok: false,
        message: error.message
      });
    }
  };

  obtenerPerfilOperativoEmpleado = async (req: AuthRequest, res: Response) => {
    try {
      const employeeId = Number(req.params.id);
      if (!Number.isInteger(employeeId) || employeeId < 1) {
        throw new EmployeeProfileError('INVALID_EMPLOYEE_ID', 'Colaborador no válido.');
      }
      const employee = await this.empleadoService.obtenerPorId(employeeId);
      assertEntitySede(req, employee.sedeId);
      return res.json({ ok: true, data: await this.employeeProfileService.getProfile(employeeId) });
    } catch (error) {
      const statusCode = error instanceof EmployeeProfileError ? error.statusCode : errorStatus(error, 500);
      return res.status(statusCode).json({
        ok: false,
        code: error instanceof EmployeeProfileError ? error.code : 'EMPLOYEE_PROFILE_ERROR',
        message: error instanceof Error ? error.message : 'No se pudo consultar el perfil del colaborador.',
      });
    }
  };

  actualizarEstadoEmpleado = async (req: AuthRequest, res: Response) => {
    try {
      const employeeId = Number(req.params.id);
      const employee = await this.empleadoService.obtenerPorId(employeeId);
      assertEntitySede(req, employee.sedeId);
      const result = await this.employeeProfileService.changeStatus(
        employeeId,
        String(req.body.status || '').toUpperCase() as EmployeeStatus,
        String(req.body.reason || ''),
        Number(req.user?.id),
        req.ip,
      );
      return res.json({
        ok: true,
        message: result.unchanged ? 'El colaborador ya tenía ese estado.' : 'Estado laboral actualizado correctamente.',
        data: result,
      });
    } catch (error) {
      const statusCode = error instanceof EmployeeProfileError ? error.statusCode : errorStatus(error, 400);
      return res.status(statusCode).json({
        ok: false,
        code: error instanceof EmployeeProfileError ? error.code : 'EMPLOYEE_STATUS_ERROR',
        message: error instanceof Error ? error.message : 'No se pudo actualizar el estado laboral.',
      });
    }
  };

  darDeBajaEmpleado = async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const empleado = await this.empleadoService.obtenerPorId(id);
      assertEntitySede(req, empleado.sedeId);
      await this.empleadoService.darDeBaja(id);
      return res.json({
        ok: true,
        message: 'Empleado dado de baja correctamente'
      });
    } catch (error: any) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error.message
      });
    }
  };

  marcarAsistencia = async (req: AuthRequest, res: Response) => {
    try {
      const {
        request_id,
        empleado_id,
        dispositivo_id,
        tipo,
        origen,
        latitud,
        longitud,
        precision_gps,
        selfie_path,
        wifi,
        bluetooth
      } = req.body;

      if (!empleado_id || !tipo || latitud === undefined || longitud === undefined || precision_gps === undefined) {
        return res.status(400).json({
          ok: false,
          message: 'Faltan parámetros de marcación obligatorios'
        });
      }

      const empleado = await this.empleadoService.obtenerPorId(Number(empleado_id));
      assertEntitySede(req, empleado.sedeId);

      const result = await this.asistenciaService.registrarMarcacion({
        requestId: request_id || randomUUID(),
        empleadoId: Number(empleado_id),
        dispositivoId: dispositivo_id ? Number(dispositivo_id) : null,
        tipo: tipo as ClockType,
        origen: (origen as ClockOrigin) || 'GPS',
        latitud: Number(latitud),
        longitud: Number(longitud),
        precisionGps: Number(precision_gps),
        selfiePath: selfie_path || null,
        wifi: wifi || null,
        bluetooth: bluetooth || null,
        verificacionIdentidad: 'ADMINISTRATIVA',
        actorUsuarioId: req.user?.id,
        ipAddress: req.ip,
      });

      return res.status(201).json({
        ok: true,
        message: 'Asistencia registrada correctamente',
        data: result
      });
    } catch (error: any) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error.message
      });
    }
  };

  consultarAsistenciasSede = async (req: AuthRequest, res: Response) => {
    try {
      const sedeId = resolveSedeScope(req, req.params.sedeId);
      const fecha = String(req.query.fecha || businessDate());

      const asistencias = await this.asistenciaService.consultarAsistenciaPorSede(sedeId, fecha);
      return res.json({
        ok: true,
        data: asistencias
      });
    } catch (error: any) {
      return res.status(errorStatus(error, 500)).json({
        ok: false,
        message: error.message
      });
    }
  };

  consultarResumenAsistencia = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveOptionalSedeScope(req, req.query.sede_id ?? req.params.sedeId);
      const data = await this.attendanceDashboardService.getDashboard(
        siteId,
        req.query.fecha || businessDate(),
        companyScope(req),
      );
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar el resumen de asistencia.',
      });
    }
  };

  consultarTendenciaAsistencia = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveOptionalSedeScope(req, req.query.sede_id);
      const data = await this.attendanceDashboardService.getTrend(
        siteId,
        req.query.desde,
        req.query.hasta,
        companyScope(req),
      );
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar la tendencia de asistencia.',
      });
    }
  };

  obtenerDetalleAsistencia = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.query.sede_id);
      const data = await this.attendanceManagementService.detail(
        siteId,
        req.query.empleado_id,
        req.query.fecha || businessDate(),
      );
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar el detalle de asistencia.',
      });
    }
  };

  obtenerReporteAsistenciaEmpleado = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.query.sede_id);
      const data = await this.attendanceManagementService.report(
        siteId,
        req.params.employeeId,
        req.query.vista || 'MONTH',
        req.query.fecha || businessDate(),
      );
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar el historial de asistencia.',
      });
    }
  };

  resolverSobretiempo = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      const data = await this.attendanceManagementService.reviewOvertime(
        siteId,
        req.params.id,
        Number(req.user?.id),
        req.body,
      );
      return res.json({ ok: true, message: 'Horas extra revisadas y auditadas.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudieron revisar las horas extra.',
      });
    }
  };

  obtenerSustentoSobretiempo = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.query.sede_id);
      const evidence = await this.attendanceManagementService.overtimeEvidence(siteId, req.params.id);
      const encodedName = encodeURIComponent(evidence.name).replace(/['()]/g, escape);
      res.setHeader('Content-Type', evidence.mimeType);
      res.setHeader('Content-Length', String(evidence.bytes));
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedName}`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(evidence.buffer);
    } catch (error) {
      return res.status(errorStatus(error, 404)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar el sustento de horas extra.',
      });
    }
  };

  resolverIncidenciaAsistencia = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      const data = await this.attendanceManagementService.reviewIncident(
        siteId,
        Number(req.user?.id),
        req.body,
      );
      return res.json({ ok: true, message: 'Incidencia revisada y auditada.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo registrar la revisión.',
      });
    }
  };

  listarIncidencias = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveOptionalSedeScope(req, req.query.sede_id ?? req.params.sedeId);
      return res.json({ ok: true, data: await this.absenceWorkflowService.list(siteId, companyScope(req), req.query.estado) });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudieron consultar las solicitudes.' });
    }
  };

  crearPermiso = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      const data = await this.absenceWorkflowService.createPermission(siteId, Number(req.user?.id), req.body);
      return res.status(201).json({ ok: true, message: 'Solicitud de permiso registrada.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo crear el permiso.' });
    }
  };

  obtenerSustentoPermiso = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.query.sede_id);
      const evidence = await this.absenceWorkflowService.getPermissionEvidence(
        siteId,
        Number(req.params.id),
      );
      const encodedName = encodeURIComponent(evidence.name).replace(/['()]/g, escape);
      res.setHeader('Content-Type', evidence.mimeType);
      res.setHeader('Content-Length', String(evidence.bytes));
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedName}`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(evidence.buffer);
    } catch (error) {
      return res.status(errorStatus(error, 404)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar el sustento.',
      });
    }
  };

  obtenerSustentoJustificacion = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.query.sede_id);
      const evidence = await this.absenceWorkflowService.getAttendanceJustificationEvidence(
        siteId,
        Number(req.params.id),
      );
      const encodedName = encodeURIComponent(evidence.name).replace(/['()]/g, escape);
      res.setHeader('Content-Type', evidence.mimeType);
      res.setHeader('Content-Length', String(evidence.bytes));
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodedName}`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(evidence.buffer);
    } catch (error) {
      return res.status(errorStatus(error, 404)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar el sustento.',
      });
    }
  };

  resolverJustificacionAsistencia = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      await this.absenceWorkflowService.resolveAttendanceJustification(
        siteId,
        Number(req.user?.id),
        Number(req.params.id),
        req.body,
      );
      return res.json({
        ok: true,
        message: 'Justificación de asistencia resuelta.',
        data: { id: Number(req.params.id) },
      });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo resolver la justificación.',
      });
    }
  };

  resolverPermiso = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      await this.absenceWorkflowService.resolvePermission(siteId, Number(req.user?.id), Number(req.params.id), req.body);
      return res.json({ ok: true, message: 'Solicitud de permiso resuelta.', data: { id: Number(req.params.id) } });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo resolver el permiso.' });
    }
  };

  cancelarPermiso = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      await this.absenceWorkflowService.cancelPermission(siteId, Number(req.user?.id), Number(req.params.id), req.body);
      return res.json({ ok: true, message: 'Solicitud de permiso cancelada.', data: { id: Number(req.params.id) } });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo cancelar el permiso.' });
    }
  };

  crearVacaciones = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      const data = await this.absenceWorkflowService.createVacation(siteId, Number(req.user?.id), req.body);
      return res.status(201).json({ ok: true, message: 'Solicitud de vacaciones registrada.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo crear la solicitud.' });
    }
  };

  resolverVacaciones = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      await this.absenceWorkflowService.resolveVacation(siteId, Number(req.user?.id), Number(req.params.id), req.body);
      return res.json({ ok: true, message: 'Solicitud de vacaciones resuelta.', data: { id: Number(req.params.id) } });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo resolver la solicitud.' });
    }
  };

  cancelarVacaciones = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      await this.absenceWorkflowService.cancelVacation(siteId, Number(req.user?.id), Number(req.params.id), req.body);
      return res.json({ ok: true, message: 'Solicitud de vacaciones cancelada.', data: { id: Number(req.params.id) } });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo cancelar la solicitud.' });
    }
  };

  corregirAsistencia = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      const data = await this.attendanceCorrectionService.correct(siteId, Number(req.user?.id), req.body);
      return res.json({ ok: true, message: 'Corrección aplicada y auditada.', data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo corregir la asistencia.' });
    }
  };

  listarContingenciasMarcacion = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveOptionalSedeScope(req, req.query.sede_id ?? req.params.sedeId);
      const data = await this.attendanceContingencyService.list(siteId, companyScope(req), String(req.query.estado || 'PENDIENTE'));
      return res.json({ ok: true, data });
    } catch (error) {
      const status = error instanceof ContingencyError ? error.statusCode : errorStatus(error, 400);
      return res.status(status).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudieron consultar las revisiones biometricas.',
      });
    }
  };

  resolverContingenciaMarcacion = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      const data = await this.attendanceContingencyService.resolve(
        siteId,
        Number(req.params.id),
        Number(req.user?.id),
        req.body.decision,
        req.body.comment,
        req.ip,
      );
      return res.json({ ok: true, message: 'Solicitud de marcacion resuelta.', data });
    } catch (error) {
      const status = error instanceof ContingencyError ? error.statusCode : errorStatus(error, 400);
      return res.status(status).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo resolver la solicitud.',
      });
    }
  };

  obtenerEvidenciaContingencia = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.query.sede_id);
      const evidence = await this.attendanceContingencyService.evidence(siteId, Number(req.params.id));
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Content-Type', evidence.mimeType);
      return res.sendFile(evidence.absolutePath);
    } catch (error) {
      const status = error instanceof ContingencyError ? error.statusCode : errorStatus(error, 400);
      return res.status(status).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar la evidencia.',
      });
    }
  };
}
