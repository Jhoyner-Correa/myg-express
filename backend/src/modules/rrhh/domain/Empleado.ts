// ============================================================
// backend/src/modules/rrhh/domain/Empleado.ts
// Entidad de Dominio que representa a un Empleado en el sistema
// ============================================================

export type EmployeeGender = 'M' | 'F';
export type EmployeeTracking = 'NINGUNO' | 'SOLO_MARCACION' | 'CONTINUO';
export type EmployeeStatus = 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';

export interface Empleado {
  id: number;
  codigoEmpleado: string;
  sedeId: number;
  cargoId: number;
  dni: string;
  ruc: string | null;
  nombres: string;
  apellidos: string;
  sexo: EmployeeGender;
  telefono: string | null;
  email: string | null;
  direccion: string;
  foto: string | null;
  fechaIngreso: Date;
  fechaCese: Date | null;
  tipoRastreo: EmployeeTracking;
  estado: EmployeeStatus;
  observaciones: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
