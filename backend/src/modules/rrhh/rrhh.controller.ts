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

function errorStatus(error: unknown, fallback: number): number {
  return error instanceof SedeScopeError ? error.statusCode : fallback;
}

export class RrhhController {
  constructor(
    private empleadoService: EmpleadoService,
    private asistenciaService: AsistenciaService
  ) {}

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

      if (!empleado_id || !tipo || !latitud || !longitud) {
        return res.status(400).json({
          ok: false,
          message: 'Faltan parámetros de marcación obligatorios'
        });
      }

      const empleado = await this.empleadoService.obtenerPorId(Number(empleado_id));
      assertEntitySede(req, empleado.sedeId);

      const result = await this.asistenciaService.registrarMarcacion({
        empleadoId: Number(empleado_id),
        dispositivoId: dispositivo_id ? Number(dispositivo_id) : null,
        tipo: tipo as ClockType,
        origen: (origen as ClockOrigin) || 'GPS',
        latitud: Number(latitud),
        longitud: Number(longitud),
        precisionGps: precision_gps ? Number(precision_gps) : null,
        selfiePath: selfie_path || null,
        wifi: wifi || null,
        bluetooth: bluetooth || null
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
}
