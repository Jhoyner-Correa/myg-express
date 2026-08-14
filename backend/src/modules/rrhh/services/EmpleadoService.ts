// ============================================================
// backend/src/modules/rrhh/services/EmpleadoService.ts
// Servicio de negocio para la gestión de Empleados
// ============================================================

import { IEmpleadoRepository } from '../repositories/IEmpleadoRepository';
import { Empleado } from '../domain/Empleado';
import { assertEmployeeDefinition } from '../domain/employeePolicy';

export class EmpleadoService {
  constructor(private empleadoRepository: IEmpleadoRepository) {}

  async registrarEmpleado(empleado: Omit<Empleado, 'id'>): Promise<Empleado> {
    assertEmployeeDefinition(empleado);
    // Validar si ya existe el DNI
    const existenteDni = await this.empleadoRepository.buscarPorDni(empleado.dni);
    if (existenteDni) {
      throw new Error('Ya existe un empleado con el mismo documento de identidad (DNI)');
    }

    // Validar si ya existe el código de empleado
    const existenteCodigo = await this.empleadoRepository.buscarPorCodigo(empleado.codigoEmpleado);
    if (existenteCodigo) {
      throw new Error('Ya existe un empleado con el mismo código identificador');
    }

    const nuevoId = await this.empleadoRepository.crear(empleado);
    const nuevoEmpleado = await this.empleadoRepository.buscarPorId(nuevoId);
    if (!nuevoEmpleado) {
      throw new Error('Error al recuperar el empleado recién creado');
    }

    return nuevoEmpleado;
  }

  async obtenerPorId(id: number): Promise<Empleado> {
    const empleado = await this.empleadoRepository.buscarPorId(id);
    if (!empleado) {
      throw new Error('Empleado no encontrado');
    }
    return empleado;
  }

  async actualizarEmpleado(id: number, datos: Partial<Omit<Empleado, 'id'>>): Promise<Empleado> {
    const empleado = await this.empleadoRepository.buscarPorId(id);
    if (!empleado) {
      throw new Error('Empleado no encontrado');
    }

    assertEmployeeDefinition({ ...empleado, ...datos });

    if (datos.dni && datos.dni !== empleado.dni) {
      const existente = await this.empleadoRepository.buscarPorDni(datos.dni);
      if (existente) throw new Error('El DNI ya está registrado por otro empleado');
    }

    if (datos.codigoEmpleado && datos.codigoEmpleado !== empleado.codigoEmpleado) {
      const existente = await this.empleadoRepository.buscarPorCodigo(datos.codigoEmpleado);
      if (existente) throw new Error('El código de empleado ya está en uso');
    }

    const exito = await this.empleadoRepository.actualizar(id, datos);
    if (!exito) {
      throw new Error('No se pudo actualizar el empleado');
    }

    const actualizado = await this.empleadoRepository.buscarPorId(id);
    if (!actualizado) {
      throw new Error('Error al recuperar el empleado actualizado');
    }

    return actualizado;
  }

  async listarPorSede(sedeId: number): Promise<(Empleado & { cargoNombre: string })[]> {
    return await this.empleadoRepository.listarPorSede(sedeId);
  }

  async darDeBaja(id: number): Promise<boolean> {
    const empleado = await this.empleadoRepository.buscarPorId(id);
    if (!empleado) {
      throw new Error('Empleado no encontrado');
    }

    return await this.empleadoRepository.actualizar(id, {
      estado: 'INACTIVO',
      fechaCese: new Date()
    });
  }
}
