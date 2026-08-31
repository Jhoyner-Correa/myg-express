// ============================================================
// backend/src/modules/auth/auth.service.ts
// Lógica de negocio para autenticación y gestión de perfil
// ============================================================

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { IUsuarioRepository } from './repositories/IUsuarioRepository';
import { Usuario } from './domain/Usuario';
import { loadAccessContext } from '../../core/auth/accessControl';
import { UserPhotoStorageService } from './services/UserPhotoStorageService';

export class AuthService {
  constructor(
    private usuarioRepository: IUsuarioRepository,
    private photoStorage = new UserPhotoStorageService(),
  ) {}

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

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    const access = await loadAccessContext(user.id);
    if (access.scope === 'SEDE' && !access.siteId) {
      throw new Error('Usuario sin sede asignada');
    }

    const token = jwt.sign(
      {
        id: user.id,
        usuario: user.usuario
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '12h' }
    );

    await this.usuarioRepository.registrarUltimoAcceso(user.id);

    return {
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        usuario: user.usuario,
        foto: user.foto,
        rol: access.role,
        rol_label: access.roleLabel,
        tipo_usuario: access.type,
        alcance: access.scope,
        empresa_id: access.companyId,
        sede_id: access.siteId,
        sede_ids: access.siteIds,
        sede_nombre: access.siteName || 'Administración Central',
        permisos: access.permissions,
        estado: user.estado,
        ultimo_acceso_at: user.ultimoAccesoAt?.toISOString() ?? null,
        password_actualizado_at: user.passwordActualizadoAt?.toISOString() ?? null,
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
    const normalizedName = String(nombre || '').trim();
    const normalizedUsername = String(usuario || '').trim();

    if (!normalizedName || !normalizedUsername) {
      throw new Error('Nombre y usuario son obligatorios');
    }
    if (normalizedName.length < 2 || normalizedName.length > 120) {
      throw new Error('El nombre debe tener entre 2 y 120 caracteres');
    }
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(normalizedUsername)) {
      throw new Error('El usuario debe tener entre 3 y 50 caracteres y solo usar letras, números, punto, guion o guion bajo');
    }

    const user = await this.usuarioRepository.buscarPorId(id);
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    let nuevoPasswordHash: string | undefined = undefined;
    const credentialsChanged = normalizedUsername !== user.usuario || Boolean(nuevoPassword);

    if (credentialsChanged) {
      if (!passwordActual) {
        throw new Error('Ingresa tu contraseña actual para modificar tus credenciales');
      }
      const passwordOk = await bcrypt.compare(passwordActual, user.passwordHash);
      if (!passwordOk) {
        throw new Error('La contraseña actual no es correcta');
      }
    }

    if (nuevoPassword) {
      const strongPassword = nuevoPassword.length >= 12
        && /[a-z]/.test(nuevoPassword)
        && /[A-Z]/.test(nuevoPassword)
        && /\d/.test(nuevoPassword)
        && /[^A-Za-z0-9]/.test(nuevoPassword);
      if (!strongPassword) {
        throw new Error('La nueva contraseña debe tener al menos 12 caracteres, mayúscula, minúscula, número y símbolo');
      }
      nuevoPasswordHash = await bcrypt.hash(nuevoPassword, 12);
    }

    const exito = await this.usuarioRepository.actualizarPerfil(
      id,
      normalizedName,
      normalizedUsername,
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

  async actualizarFotoPerfil(id: number, buffer: Buffer, mimeType: string): Promise<Usuario> {
    const current = await this.obtenerPerfil(id);
    const newPhotoUrl = await this.photoStorage.save(buffer, mimeType);
    try {
      if (!await this.usuarioRepository.actualizarFoto(id, newPhotoUrl)) {
        throw new Error('No se pudo actualizar la foto del perfil');
      }
    } catch (error) {
      await this.photoStorage.removeManaged(newPhotoUrl).catch(() => undefined);
      throw error;
    }
    await this.photoStorage.removeManaged(current.foto).catch(() => undefined);
    return this.obtenerPerfil(id);
  }

  async eliminarFotoPerfil(id: number): Promise<Usuario> {
    const current = await this.obtenerPerfil(id);
    if (!await this.usuarioRepository.actualizarFoto(id, null)) {
      throw new Error('No se pudo eliminar la foto del perfil');
    }
    await this.photoStorage.removeManaged(current.foto).catch(() => undefined);
    return this.obtenerPerfil(id);
  }
}
