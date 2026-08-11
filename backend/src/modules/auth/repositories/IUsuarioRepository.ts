// ============================================================
// backend/src/modules/auth/repositories/IUsuarioRepository.ts
// Interfaz del repositorio de usuarios
// ============================================================

import { Usuario } from '../domain/Usuario';

export interface IUsuarioRepository {
  buscarPorUsuario(username: string): Promise<Usuario | null>;
  buscarPorId(id: number): Promise<Usuario | null>;
  actualizarPerfil(
    id: number,
    nombre: string,
    usuario: string,
    passwordHash?: string
  ): Promise<boolean>;
  
  // Métodos administrativos para gestión de usuarios
  crear(usuario: Omit<Usuario, 'id' | 'createdAt' | 'updatedAt'>): Promise<number>;
  actualizar(id: number, datos: Partial<Omit<Usuario, 'id' | 'createdAt' | 'updatedAt'>>): Promise<boolean>;
  listarTodos(): Promise<(Usuario & { sedeNombre: string | null })[]>;
  eliminar(id: number): Promise<boolean>;
}
