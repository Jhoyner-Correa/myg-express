// ============================================================
// backend/src/modules/auth/auth.controller.ts
// Controlador HTTP para autenticación y perfil de usuario
// ============================================================

import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { normalizeRole, roleRequiresSede } from '../../core/constants/roles';
import { getFinalPermissions } from '../../core/constants/permissions';
import { pool } from '../../core/database/database';

export class AuthController {
  constructor(private authService: AuthService) {}

  login = async (req: Request, res: Response) => {
    try {
      const { usuario, password } = req.body;
      const result = await this.authService.login(usuario, password);
      
      // NOTA: Para obtener el nombre real de la sede, podemos hacer un query rápido
      let sedeNombre = 'Administración Central';
      if (result.user.sede_id) {
        const [sedeRows]: any = await pool.query(
          'SELECT nombre FROM sedes WHERE id = ? LIMIT 1',
          [result.user.sede_id]
        );
        if (sedeRows.length > 0) {
          sedeNombre = sedeRows[0].nombre;
        }
      }
      
      result.user.sede_nombre = sedeNombre;

      return res.json({
        ok: true,
        message: 'Login correcto',
        token: result.token,
        user: result.user
      });
    } catch (error: any) {
      const status = error.message.includes('incorrectos') ? 401 : 400;
      return res.status(status).json({
        ok: false,
        message: error.message
      });
    }
  };

  perfil = async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      const user = await this.authService.obtenerPerfil(userId);
      
      let sedeNombre = 'Administración Central';
      if (user.sedeId) {
        const [sedeRows]: any = await pool.query(
          'SELECT nombre FROM sedes WHERE id = ? LIMIT 1',
          [user.sedeId]
        );
        if (sedeRows.length > 0) {
          sedeNombre = sedeRows[0].nombre;
        }
      }

      const rol = normalizeRole(user.rol, user.esSuperadmin);
      const permisos = getFinalPermissions(rol, user.permisos);

      return res.json({
        ok: true,
        user: {
          id: user.id,
          nombre: user.nombre,
          usuario: user.usuario,
          rol,
          es_superadmin: user.esSuperadmin,
          sede_id: user.sedeId,
          sede_nombre: sedeNombre,
          permisos
        }
      });
    } catch (error: any) {
      return res.status(500).json({
        ok: false,
        message: 'Error al obtener perfil',
        error: error.message
      });
    }
  };

  actualizarPerfil = async (req: any, res: Response) => {
    try {
      const userId = req.user?.id;
      const { nombre, usuario, password_actual, nuevo_password } = req.body;

      const user = await this.authService.actualizarPerfil(
        userId,
        nombre,
        usuario,
        password_actual,
        nuevo_password
      );

      let sedeNombre = 'Administración Central';
      if (user.sedeId) {
        const [sedeRows]: any = await pool.query(
          'SELECT nombre FROM sedes WHERE id = ? LIMIT 1',
          [user.sedeId]
        );
        if (sedeRows.length > 0) {
          sedeNombre = sedeRows[0].nombre;
        }
      }

      const rol = normalizeRole(user.rol, user.esSuperadmin);
      const permisos = getFinalPermissions(rol, user.permisos);

      return res.json({
        ok: true,
        message: 'Perfil actualizado correctamente',
        user: {
          id: user.id,
          nombre: user.nombre,
          usuario: user.usuario,
          rol,
          es_superadmin: user.esSuperadmin,
          sede_id: user.sedeId,
          sede_nombre: sedeNombre,
          permisos
        }
      });
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY' || error?.message?.includes('ya esta en uso')) {
        return res.status(409).json({
          ok: false,
          message: 'El usuario ya esta en uso'
        });
      }

      return res.status(400).json({
        ok: false,
        message: error.message
      });
    }
  };
}
