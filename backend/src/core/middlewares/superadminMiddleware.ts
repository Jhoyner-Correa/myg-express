import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { normalizeRole, ROLES, USER_TYPES } from '../constants/roles';

export const verificarSuperadmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const isSysAdmin = req.user?.tipo_usuario === USER_TYPES.SYSTEM
    && normalizeRole(req.user?.rol) === ROLES.SYSADMIN;

  if (!isSysAdmin) {
    return res.status(403).json({
      ok: false,
      message: 'Acceso restringido a superadmin'
    });
  }

  next();
};
