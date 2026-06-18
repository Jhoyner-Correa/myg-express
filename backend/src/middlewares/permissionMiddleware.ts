import { NextFunction, Response } from 'express';
import { AppPermission, hasPermission } from '../constants/permissions';
import { normalizeRole } from '../constants/roles';
import { AuthRequest } from './authMiddleware';

export function requirePermission(permission: AppPermission) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = normalizeRole(req.user?.rol, Boolean(req.user?.es_superadmin));

    if (!hasPermission(role, permission)) {
      return res.status(403).json({
        ok: false,
        message: 'No tienes permiso para realizar esta accion',
        permission
      });
    }

    next();
  };
}
