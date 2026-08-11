// ============================================================
// backend/src/modules/rrhh/repositories/IAsistenciaRepository.ts
// Interfaz para la persistencia de Asistencia
// ============================================================

import { Asistencia } from '../domain/Asistencia';

export interface IAsistenciaRepository {
  obtenerPorEmpleadoYFecha(empleadoId: number, fecha: string): Promise<Asistencia | null>;
  obtenerPorId(id: number): Promise<Asistencia | null>;
  crear(asistencia: Omit<Asistencia, 'id'>): Promise<number>;
  actualizar(id: number, datos: Partial<Omit<Asistencia, 'id'>>): Promise<boolean>;
  listarPorSedeYFecha(
    sedeId: number,
    fecha: string
  ): Promise<(Asistencia & { codigoEmpleado: string; nombres: string; apellidos: string; cargoNombre: string })[]>;
}
