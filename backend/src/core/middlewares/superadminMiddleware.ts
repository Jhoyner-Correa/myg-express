import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { normalizeRole, ROLES } from '../constants/roles';

export const verificarSuperadmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const isSysAdmin = Boolean(req.user?.es_superadmin)
    && normalizeRole(req.user?.rol) === ROLES.SYSADMIN;

  if (!isSysAdmin) {
    return res.status(403).json({
      ok: false,
      message: 'Acceso restringido a superadmin'
    });
  }

  next();
};
