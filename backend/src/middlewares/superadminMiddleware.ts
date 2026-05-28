import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';

export const verificarSuperadmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.es_superadmin) {
    return res.status(403).json({
      ok: false,
      message: 'Acceso restringido a superadmin'
    });
  }

  next();
};
