// ============================================================
// backend/src/modules/rrhh/repositories/IMarcacionRepository.ts
// Interfaz para la persistencia de Marcaciones de asistencia
// ============================================================

import { Marcacion } from '../domain/Marcacion';

export interface IMarcacionRepository {
  crear(marcacion: Omit<Marcacion, 'id'>): Promise<number>;
  obtenerPorAsistencia(asistenciaId: number): Promise<Marcacion[]>;
}
