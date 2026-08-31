import { Usuario } from '../domain/Usuario';

export interface IUsuarioRepository {
  buscarPorUsuario(username: string): Promise<Usuario | null>;
  buscarPorId(id: number): Promise<Usuario | null>;
  registrarUltimoAcceso(id: number): Promise<void>;
  actualizarPerfil(
    id: number,
    nombre: string,
    usuario: string,
    passwordHash?: string
  ): Promise<boolean>;
  actualizarFoto(id: number, foto: string | null): Promise<boolean>;
}
