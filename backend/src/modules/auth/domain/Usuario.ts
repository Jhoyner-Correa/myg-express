// ============================================================
// backend/src/modules/auth/domain/Usuario.ts
// Entidad de Dominio que representa a un Usuario en el sistema
// ============================================================

export type UserRole = 'SysAdmin' | 'AdminEmpresa' | 'EncargadoOficina';
export type UserStatus = 'activo' | 'inactivo';

export interface Usuario {
  id: number;
  sedeId: number | null;
  nombre: string;
  usuario: string;
  passwordHash: string;
  rol: UserRole;
  esSuperadmin: boolean;
  estado: UserStatus;
  permisos?: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}
