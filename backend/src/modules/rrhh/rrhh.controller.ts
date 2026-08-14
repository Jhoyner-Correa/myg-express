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
import { assertEntitySede, resolveSedeScope, SedeScopeError } from '../../core/auth/sedeScope';
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

function errorStatus(error: unknown, fallback: number): number {
  if (error instanceof SedeScopeError || error instanceof AttendanceRuleError) return error.statusCode;
  return fallback;
}

export class RrhhController {
  private readonly mobileAuthService = new MobileAuthService();
  private readonly geofenceService = new GeofenceService();
  private readonly catalogService = new RrhhCatalogService();
  private readonly attendanceDashboardService = new AttendanceDashboardService();
  private readonly absenceWorkflowService = new AbsenceWorkflowService();
  private readonly attendanceCorrectionService = new AttendanceCorrectionService();
  private readonly scheduleService = new ScheduleService();
  private readonly attendanceContingencyService: AttendanceContingencyService;

  constructor(
    private empleadoService: EmpleadoService,
    private asistenciaService: AsistenciaService
  ) {
    this.attendanceContingencyService = new AttendanceContingencyService(asistenciaService);
  }

  listarCatalogos = async (req: AuthRequest, res: Response) => {
    try {
      const scopedSite = req.user?.sede_id ? Number(req.user.sede_id) : null;
      const [sites, roles, schedules] = await Promise.all([
        this.catalogService.listSites(scopedSite),
        this.catalogService.listJobRoles(),
        this.scheduleService.listSchedules(),
      ]);
      return res.json({ ok: true, data: { sites, roles, schedules } });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudieron consultar los catálogos.',
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
        codigo_empleado,
        sede_id,
        cargo_id,
        dni,
        nombres,
        apellidos,
        sexo,
        telefono,
        email,
        foto,
        fecha_ingreso,
        tipo_rastreo,
        estado,
        observaciones
      } = req.body;

      if (!codigo_empleado || !sede_id || !cargo_id || !dni || !nombres || !apellidos || !sexo || !fecha_ingreso) {
        return res.status(400).json({
          ok: false,
          message: 'Faltan campos obligatorios'
        });
      }

      const sedeId = resolveSedeScope(req, sede_id);
      const nuevoEmpleado = await this.empleadoService.registrarEmpleado({
        codigoEmpleado: codigo_empleado,
        sedeId,
        cargoId: Number(cargo_id),
        dni,
        nombres,
        apellidos,
        sexo: sexo as EmployeeGender,
        telefono: telefono || null,
        email: email || null,
        foto: foto || null,
        fechaIngreso: new Date(fecha_ingreso),
        fechaCese: null,
        tipoRastreo: (tipo_rastreo as EmployeeTracking) || 'SOLO_MARCACION',
        estado: (estado as EmployeeStatus) || 'ACTIVO',
        observaciones: observaciones || null
      });

      return res.status(201).json({
        ok: true,
        message: 'Empleado registrado con éxito',
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
        req.body.temporary_password ? String(req.body.temporary_password) : undefined,
      );
      return res.status(201).json({
        ok: true,
        message: 'Credenciales de activacion generadas. Se muestran una sola vez.',
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
      }, Number(req.user?.id), req.ip);
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

      // Mapear campos snake_case a camelCase si existen en la petición
      const mappedDatos: any = {};
      if (datos.codigo_empleado !== undefined) mappedDatos.codigoEmpleado = datos.codigo_empleado;
      if (datos.sede_id !== undefined) mappedDatos.sedeId = resolveSedeScope(req, datos.sede_id);
      if (datos.cargo_id !== undefined) mappedDatos.cargoId = Number(datos.cargo_id);
      if (datos.dni !== undefined) mappedDatos.dni = datos.dni;
      if (datos.nombres !== undefined) mappedDatos.nombres = datos.nombres;
      if (datos.apellidos !== undefined) mappedDatos.apellidos = datos.apellidos;
      if (datos.sexo !== undefined) mappedDatos.sexo = datos.sexo;
      if (datos.telefono !== undefined) mappedDatos.telefono = datos.telefono;
      if (datos.email !== undefined) mappedDatos.email = datos.email;
      if (datos.foto !== undefined) mappedDatos.foto = datos.foto;
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

  listarEmpleadosSede = async (req: AuthRequest, res: Response) => {
    try {
      const sedeId = resolveSedeScope(req, req.params.sedeId);
      const empleados = await this.empleadoService.listarPorSede(sedeId);
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
      const siteId = resolveSedeScope(req, req.params.sedeId);
      const data = await this.attendanceDashboardService.getDailyDashboard(
        siteId,
        req.query.fecha || businessDate(),
      );
      return res.json({ ok: true, data });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'No se pudo consultar el resumen de asistencia.',
      });
    }
  };

  listarIncidencias = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.params.sedeId);
      return res.json({ ok: true, data: await this.absenceWorkflowService.list(siteId, req.query.estado) });
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

  resolverPermiso = async (req: AuthRequest, res: Response) => {
    try {
      const siteId = resolveSedeScope(req, req.body.sede_id);
      await this.absenceWorkflowService.resolvePermission(siteId, Number(req.user?.id), Number(req.params.id), req.body);
      return res.json({ ok: true, message: 'Solicitud de permiso resuelta.', data: { id: Number(req.params.id) } });
    } catch (error) {
      return res.status(errorStatus(error, 400)).json({ ok: false, message: error instanceof Error ? error.message : 'No se pudo resolver el permiso.' });
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
      const siteId = resolveSedeScope(req, req.params.sedeId);
      const data = await this.attendanceContingencyService.list(siteId, String(req.query.estado || 'PENDIENTE'));
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
