// ============================================================
// backend/src/modules/rrhh/repositories/IMarcacionRepository.ts
// Interfaz para la persistencia de Marcaciones de asistencia
// ============================================================

import { Marcacion } from '../domain/Marcacion';
import { PoolConnection } from 'mysql2/promise';

export interface IMarcacionRepository {
  crear(marcacion: Omit<Marcacion, 'id'>, connection?: PoolConnection): Promise<number>;
  obtenerPorAsistencia(asistenciaId: number, connection?: PoolConnection): Promise<Marcacion[]>;
  obtenerPorRequestId(requestId: string, connection?: PoolConnection): Promise<Marcacion | null>;
}
