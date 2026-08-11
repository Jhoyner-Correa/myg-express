// ============================================================
// backend/src/modules/rrhh/repositories/IEmpleadoRepository.ts
// Interfaz para la persistencia del Empleado
// ============================================================

import { Empleado } from '../domain/Empleado';

export interface IEmpleadoRepository {
  buscarPorId(id: number): Promise<Empleado | null>;
  buscarPorCodigo(codigo: string): Promise<Empleado | null>;
  buscarPorDni(dni: string): Promise<Empleado | null>;
  crear(empleado: Omit<Empleado, 'id'>): Promise<number>;
  actualizar(id: number, datos: Partial<Omit<Empleado, 'id'>>): Promise<boolean>;
  listarPorSede(sedeId: number): Promise<(Empleado & { cargoNombre: string })[]>;
  eliminar(id: number): Promise<boolean>;
}
