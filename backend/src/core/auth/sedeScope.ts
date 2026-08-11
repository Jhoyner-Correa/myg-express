import { AuthRequest } from '../middlewares/authMiddleware';

export class SedeScopeError extends Error {
  readonly statusCode = 403;

  constructor(message = 'No tienes acceso a la sede solicitada') {
    super(message);
    this.name = 'SedeScopeError';
  }
}

function validSedeId(value: unknown): number | null {
  const sedeId = Number(value);
  return Number.isInteger(sedeId) && sedeId > 0 ? sedeId : null;
}

export function resolveSedeScope(req: AuthRequest, requestedSedeId: unknown): number {
  if (!req.user) {
    throw new SedeScopeError('Usuario no autenticado');
  }

  const userSedeId = validSedeId(req.user.sede_id);
  const requested = validSedeId(requestedSedeId);

  // Los roles globales no tienen sede en el contexto autenticado.
  if (userSedeId === null) {
    if (requested === null) {
      throw new SedeScopeError('Debes indicar una sede valida');
    }
    return requested;
  }

  if (requested !== null && requested !== userSedeId) {
    throw new SedeScopeError();
  }

  return userSedeId;
}

export function assertEntitySede(req: AuthRequest, entitySedeId: unknown): number {
  return resolveSedeScope(req, entitySedeId);
}
