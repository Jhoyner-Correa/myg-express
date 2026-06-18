import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2';
import { pool } from '../config/database';
import { AppPermission, getPermissionsForRole } from '../constants/permissions';
import { normalizeRole, roleRequiresSede } from '../constants/roles';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    sede_id: number | null;
    nombre: string;
    usuario: string;
    rol: string;
    es_superadmin: boolean;
    estado: 'activo' | 'inactivo';
    sede_nombre: string | null;
    permisos: AppPermission[];
  };
}

type TokenPayload = {
  id?: number;
  usuario?: string;
};

type UsuarioAuthRow = RowDataPacket & {
  id: number;
  sede_id: number | null;
  nombre: string;
  usuario: string;
  rol: string;
  es_superadmin: number;
  estado: 'activo' | 'inactivo';
  sede_nombre: string | null;
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
          u.sede_id,
          u.nombre,
          u.usuario,
          u.rol,
          u.es_superadmin,
          u.estado,
          s.nombre AS sede_nombre
       FROM usuarios u
       LEFT JOIN sedes s ON s.id = u.sede_id
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

    const es_superadmin = Boolean(user.es_superadmin);
    const rol = normalizeRole(user.rol, es_superadmin);
    const sede_id = roleRequiresSede(rol) ? user.sede_id : null;
    const permisos = getPermissionsForRole(rol);

    if (roleRequiresSede(rol) && !sede_id) {
      return res.status(403).json({
        ok: false,
        message: 'Usuario sin sede asignada'
      });
    }

    req.user = {
      id: user.id,
      sede_id,
      nombre: user.nombre,
      usuario: user.usuario,
      rol,
      es_superadmin,
      estado: user.estado,
      sede_nombre: user.sede_nombre || null,
      permisos
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      message: 'Token invalido o expirado'
    });
  }
};
