// ============================================================
// backend/src/modules/auth/domain/Usuario.ts
// Entidad de Dominio que representa a un Usuario en el sistema
// ============================================================

export type UserStatus = 'activo' | 'inactivo';
export type UserType = 'SISTEMA' | 'EMPRESA';

export interface Usuario {
  id: number;
  nombre: string;
  usuario: string;
  foto: string | null;
  passwordHash: string;
  tipoUsuario: UserType;
  estado: UserStatus;
  ultimoAccesoAt: Date | null;
  passwordActualizadoAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
