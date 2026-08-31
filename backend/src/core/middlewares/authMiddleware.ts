import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { pool } from '../database/database';
import { AppPermission } from '../constants/permissions';
import { AccessScope, UserType } from '../constants/roles';
import { loadAccessContext } from '../auth/accessControl';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    sede_id: number | null;
    nombre: string;
    usuario: string;
    rol: string;
    rol_label: string;
    tipo_usuario: UserType;
    alcance: AccessScope;
    empresa_id: number | null;
    estado: 'activo' | 'inactivo';
    sede_nombre: string | null;
    sede_ids: number[];
    permisos: AppPermission[];
  };
}

type TokenPayload = {
  id?: number;
  usuario?: string;
};

type UsuarioAuthRow = RowDataPacket & {
  id: number;
  nombre: string;
  usuario: string;
  tipo_usuario: UserType;
  estado: 'activo' | 'inactivo';
};

export const verificarToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        ok: false,
        message: 'Token no proporcionado'
      });
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        ok: false,
        message: 'Formato de token invalido'
      });
    }

    const decoded = jwt.verify(parts[1], process.env.JWT_SECRET as string) as TokenPayload;

    if (!decoded.id) {
      return res.status(401).json({
        ok: false,
        message: 'Token invalido'
      });
    }

    const [rows] = await pool.query<UsuarioAuthRow[]>(
      `SELECT
          u.id,
          u.nombre,
          u.usuario,
          u.tipo_usuario,
          u.estado
       FROM usuarios u
       WHERE u.id = ?
       LIMIT 1`,
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario no existe'
      });
    }

    const user = rows[0];

    if (user.estado !== 'activo') {
      return res.status(403).json({
        ok: false,
        message: 'Usuario inactivo'
      });
    }

    const access = await loadAccessContext(user.id);

    if (access.scope === 'SEDE' && !access.siteId) {
      return res.status(403).json({
        ok: false,
        message: 'Usuario sin sede asignada'
      });
    }

    req.user = {
      id: user.id,
      sede_id: access.siteId,
      nombre: user.nombre,
      usuario: user.usuario,
      rol: access.role,
      rol_label: access.roleLabel,
      tipo_usuario: access.type,
      alcance: access.scope,
      empresa_id: access.companyId,
      estado: user.estado,
      sede_nombre: access.siteName,
      sede_ids: access.siteIds,
      permisos: access.permissions,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: 'Token invalido o expirado'
    });
  }
};
