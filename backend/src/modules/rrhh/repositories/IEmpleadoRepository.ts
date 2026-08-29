// ============================================================
// backend/src/modules/rrhh/repositories/IEmpleadoRepository.ts
// Interfaz para la persistencia del Empleado
// ============================================================

import { Empleado } from '../domain/Empleado';

export interface IEmpleadoRepository {
  buscarPorId(id: number): Promise<Empleado | null>;
  buscarPorCodigo(codigo: string): Promise<Empleado | null>;
  buscarPorDni(dni: string): Promise<Empleado | null>;
  buscarPorRuc(ruc: string): Promise<Empleado | null>;
  crearConCodigoAutomatico(empleado: Omit<Empleado, 'id' | 'codigoEmpleado'>): Promise<number>;
  actualizar(id: number, datos: Partial<Omit<Empleado, 'id' | 'codigoEmpleado'>>): Promise<boolean>;
  listarPorSede(sedeId: number): Promise<(Empleado & { cargoNombre: string })[]>;
  listarDirectorio(sedeId: number | null, companyId: number | null): Promise<(Empleado & { cargoNombre: string; sedeNombre: string; accesoMovilActivo: boolean })[]>;
  eliminar(id: number): Promise<boolean>;
}
