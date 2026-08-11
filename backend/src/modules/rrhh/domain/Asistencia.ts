// ============================================================
// backend/src/modules/rrhh/domain/Asistencia.ts
// Entidad de Dominio que representa el registro diario de Asistencia
// ============================================================

export type AttendanceStatus = 'PRESENTE' | 'TARDANZA' | 'FALTA' | 'PERMISO' | 'VACACIONES';
export type AttendanceType = 'NORMAL' | 'REMOTA' | 'COMISION' | 'VISITA';

export interface Asistencia {
  id: number;
  empleadoId: number;
  fecha: Date; // AAAA-MM-DD
  estadoAsistencia: AttendanceStatus;
  tipoAsistencia: AttendanceType;
  minutosTardanza: number;
  createdAt?: Date;
  updatedAt?: Date;
}
