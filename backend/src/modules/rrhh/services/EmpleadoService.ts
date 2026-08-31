import { IEmpleadoRepository } from '../repositories/IEmpleadoRepository';
import { Empleado } from '../domain/Empleado';
import { assertEmployeeDefinition } from '../domain/employeePolicy';

export class EmpleadoService {
  constructor(private empleadoRepository: IEmpleadoRepository) {}

  async registrarEmpleado(empleado: Omit<Empleado, 'id' | 'codigoEmpleado'>): Promise<Empleado> {
    assertEmployeeDefinition(empleado);
    const existenteDni = await this.empleadoRepository.buscarPorDni(empleado.dni);
    if (existenteDni) throw new Error('Ya existe un empleado con el mismo documento de identidad (DNI)');
    if (empleado.ruc) {
      const existenteRuc = await this.empleadoRepository.buscarPorRuc(empleado.ruc);
      if (existenteRuc) throw new Error('Ya existe un empleado con el mismo RUC');
    }

    const nuevoId = await this.empleadoRepository.crearConCodigoAutomatico(empleado);
    const nuevoEmpleado = await this.empleadoRepository.buscarPorId(nuevoId);
    if (!nuevoEmpleado) throw new Error('Error al recuperar el empleado recien creado');
    return nuevoEmpleado;
  }

  async obtenerPorId(id: number): Promise<Empleado> {
    const empleado = await this.empleadoRepository.buscarPorId(id);
    if (!empleado) throw new Error('Empleado no encontrado');
    return empleado;
  }

  async actualizarEmpleado(
    id: number,
    datos: Partial<Omit<Empleado, 'id' | 'codigoEmpleado'>>,
  ): Promise<Empleado> {
    const empleado = await this.empleadoRepository.buscarPorId(id);
    if (!empleado) throw new Error('Empleado no encontrado');

    assertEmployeeDefinition({ ...empleado, ...datos });
    if (datos.dni && datos.dni !== empleado.dni) {
      const existente = await this.empleadoRepository.buscarPorDni(datos.dni);
      if (existente) throw new Error('El DNI ya esta registrado por otro empleado');
    }
    if (datos.ruc && datos.ruc !== empleado.ruc) {
      const existente = await this.empleadoRepository.buscarPorRuc(datos.ruc);
      if (existente) throw new Error('El RUC ya esta registrado por otro empleado');
    }

    const exito = await this.empleadoRepository.actualizar(id, datos);
    if (!exito) throw new Error('No se pudo actualizar el empleado');

    const actualizado = await this.empleadoRepository.buscarPorId(id);
    if (!actualizado) throw new Error('Error al recuperar el empleado actualizado');
    return actualizado;
  }

  async listarPorSede(sedeId: number): Promise<(Empleado & { cargoNombre: string })[]> {
    return this.empleadoRepository.listarPorSede(sedeId);
  }

  async listarDirectorio(sedeId: number | null, companyId: number | null) {
    return this.empleadoRepository.listarDirectorio(sedeId, companyId);
  }

  async darDeBaja(id: number): Promise<boolean> {
    const empleado = await this.empleadoRepository.buscarPorId(id);
    if (!empleado) throw new Error('Empleado no encontrado');
    return this.empleadoRepository.actualizar(id, {
      estado: 'INACTIVO',
      fechaCese: new Date(),
    });
  }
}
