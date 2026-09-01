// ============================================================
// backend/src/modules/auth/domain/Usuario.ts
// Entidad de Dominio que representa a un Usuario en el sistema
// ============================================================

export type UserStatus = 'activo' | 'inactivo';
export type UserType = 'SISTEMA' | 'EMPRESA';
export type UserAvatarVariant = 'male' | 'female';

export interface Usuario {
  id: number;
  nombre: string;
  usuario: string;
  foto: string | null;
  avatarVariant: UserAvatarVariant;
  passwordHash: string;
  tipoUsuario: UserType;
  estado: UserStatus;
  ultimoAccesoAt: Date | null;
  passwordActualizadoAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
