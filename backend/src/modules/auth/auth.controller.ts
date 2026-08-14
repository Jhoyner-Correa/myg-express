import { Request, Response } from 'express';
import { loadAccessContext } from '../../core/auth/accessControl';
import { AuthService } from './auth.service';

function publicUser(user: { id: number; nombre: string; usuario: string }, access: Awaited<ReturnType<typeof loadAccessContext>>) {
  return {
    id: user.id,
    nombre: user.nombre,
    usuario: user.usuario,
    rol: access.role,
    rol_label: access.roleLabel,
    tipo_usuario: access.type,
    alcance: access.scope,
    empresa_id: access.companyId,
    sede_id: access.siteId,
    sede_ids: access.siteIds,
    sede_nombre: access.siteName || 'Administración Central',
    permisos: access.permissions,
  };
}

export class AuthController {
  constructor(private authService: AuthService) {}

  login = async (req: Request, res: Response) => {
    try {
      const { usuario, password } = req.body;
      const result = await this.authService.login(usuario, password);
      return res.json({ ok: true, message: 'Login correcto', ...result });
    } catch (error: any) {
      const status = error.message.includes('incorrectos') ? 401 : 400;
      return res.status(status).json({ ok: false, message: error.message });
    }
  };

  perfil = async (req: any, res: Response) => {
    try {
      const user = await this.authService.obtenerPerfil(req.user?.id);
      const access = await loadAccessContext(user.id);
      return res.json({ ok: true, user: publicUser(user, access) });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        message: 'Error al obtener perfil',
        error: error.message,
      });
    }
  };

  actualizarPerfil = async (req: any, res: Response) => {
    try {
      const { nombre, usuario, password_actual, nuevo_password } = req.body;
      const user = await this.authService.actualizarPerfil(
        req.user?.id,
        nombre,
        usuario,
        password_actual,
        nuevo_password,
      );
      const access = await loadAccessContext(user.id);
      return res.json({
        ok: true,
        message: 'Perfil actualizado correctamente',
        user: publicUser(user, access),
      });
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.message?.includes('ya esta en uso')) {
        return res.status(409).json({ ok: false, message: 'El usuario ya esta en uso' });
      }
      return res.status(400).json({ ok: false, message: error.message });
    }
  };
}
