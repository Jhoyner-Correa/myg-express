import { NextFunction, Response } from 'express';
import { AppPermission } from '../constants/permissions';
import { AuthRequest } from './authMiddleware';

export function requirePermission(permission: AppPermission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.permisos?.includes(permission)) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permiso para realizar esta accion',
        permission
      });
    }

    next();
  };
}
