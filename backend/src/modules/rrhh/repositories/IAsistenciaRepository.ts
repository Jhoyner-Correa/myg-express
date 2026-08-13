// ============================================================
// backend/src/modules/rrhh/repositories/IAsistenciaRepository.ts
// Interfaz para la persistencia de Asistencia
// ============================================================

import { Asistencia } from '../domain/Asistencia';
import { PoolConnection } from 'mysql2/promise';

export interface IAsistenciaRepository {
  obtenerPorEmpleadoYFecha(empleadoId: number, fecha: string, connection?: PoolConnection, lock?: boolean): Promise<Asistencia | null>;
  obtenerPorId(id: number, connection?: PoolConnection): Promise<Asistencia | null>;
  crear(asistencia: Omit<Asistencia, 'id'>, connection?: PoolConnection): Promise<number>;
  obtenerOCrear(asistencia: Omit<Asistencia, 'id'>, connection: PoolConnection): Promise<Asistencia>;
  actualizar(id: number, datos: Partial<Omit<Asistencia, 'id'>>, connection?: PoolConnection): Promise<boolean>;
  listarPorSedeYFecha(
    sedeId: number,
    fecha: string
  ): Promise<(Asistencia & { codigoEmpleado: string; nombres: string; apellidos: string; cargoNombre: string })[]>;
}
