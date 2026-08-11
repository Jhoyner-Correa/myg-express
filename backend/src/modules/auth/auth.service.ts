// ============================================================
// backend/src/modules/auth/auth.service.ts
// Lógica de negocio para autenticación y gestión de perfil
// ============================================================

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { IUsuarioRepository } from './repositories/IUsuarioRepository';
import { Usuario } from './domain/Usuario';
import { normalizeRole, roleRequiresSede, getRoleLabel } from '../../core/constants/roles';
import { getFinalPermissions } from '../../core/constants/permissions';

export class AuthService {
  constructor(private usuarioRepository: IUsuarioRepository) {}

  async login(usuario: string, password: string): Promise<{ token: string; user: any }> {
    if (!usuario || !password) {
      throw new Error('Usuario y contraseña son obligatorios');
    }

    const user = await this.usuarioRepository.buscarPorUsuario(usuario);
    if (!user) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    if (user.estado !== 'activo') {
      throw new Error('Usuario inactivo');
    }

    const rol = normalizeRole(user.rol, user.esSuperadmin);
    const sedeId = roleRequiresSede(rol) ? user.sedeId : null;

    if (roleRequiresSede(rol) && !sedeId) {
      throw new Error('Usuario sin sede asignada');
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    const token = jwt.sign(
      {
        id: user.id,
        sede_id: sedeId,
        usuario: user.usuario,
        rol,
        es_superadmin: user.esSuperadmin
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '12h' }
    );

    const permisos = getFinalPermissions(rol, user.permisos);

    return {
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        usuario: user.usuario,
        rol,
        es_superadmin: user.esSuperadmin,
        sede_id: sedeId,
        sede_nombre: 'Administración Central', // NOTA: En login el controlador original hace LEFT JOIN sedes s ON u.sede_id = s.id, lo manejamos recuperando el valor.
        permisos
      }
    };
  }

  async obtenerPerfil(id: number): Promise<Usuario> {
    const user = await this.usuarioRepository.buscarPorId(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }
    return user;
  }

  async actualizarPerfil(
    id: number,
    nombre: string,
    usuario: string,
    passwordActual: string,
    nuevoPassword?: string
  ): Promise<Usuario> {
    if (!nombre || !usuario) {
      throw new Error('Nombre y usuario son obligatorios');
    }

    const user = await this.usuarioRepository.buscarPorId(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    let nuevoPasswordHash: string | undefined = undefined;

    if (nuevoPassword) {
      if (nuevoPassword.length < 6) {
        throw new Error('La nueva contraseña debe tener al menos 6 caracteres');
      }
      if (!passwordActual) {
        throw new Error('Ingresa tu contraseña actual para cambiarla');
      }

      const passwordOk = await bcrypt.compare(passwordActual, user.passwordHash);
      if (!passwordOk) {
        throw new Error('La contraseña actual no es correcta');
      }

      nuevoPasswordHash = await bcrypt.hash(nuevoPassword, 10);
    }

    const exito = await this.usuarioRepository.actualizarPerfil(
      id,
      nombre,
      usuario,
      nuevoPasswordHash
    );

    if (!exito) {
      throw new Error('No se pudo actualizar el perfil');
    }

    const usuarioActualizado = await this.usuarioRepository.buscarPorId(id);
    if (!usuarioActualizado) {
      throw new Error('Error al recuperar el perfil actualizado');
    }

    return usuarioActualizado;
  }
}
