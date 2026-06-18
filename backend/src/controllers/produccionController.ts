import { Response } from 'express';

import { AuthRequest } from '../middlewares/authMiddleware';
import {
  fetchRouteData,
  getUrbanoStatus
} from '../services/urbanoService';
import {
  clearUrbanoRouteCache,
  getLatestUrbanoRouteCache,
  saveUrbanoRouteCache
} from '../services/urbanoRouteCacheService';

function getUrbanoContext(req: AuthRequest) {
  const userId = Number(req.user?.id);
  const rawSedeId = req.user?.sede_id;
  const sedeId = rawSedeId === null || rawSedeId === undefined ? null : Number(rawSedeId);
  const normalizedSedeId =
    sedeId !== null && Number.isFinite(sedeId) && sedeId > 0 ? sedeId : null;

  return {
    userId,
    sedeId: normalizedSedeId
  };
}

export function estadoUrbano(req: AuthRequest, res: Response) {
  const context = getUrbanoContext(req);

  return res.json({
    ok: true,
    data: getUrbanoStatus(context)
  });
}

export async function consultarRutaUrbano(req: AuthRequest, res: Response) {
  try {
    const context = getUrbanoContext(req);
    const routeId = String(req.params.routeId || '').trim();

    if (!context.userId || !/^\d{1,20}$/.test(routeId)) {
      return res.status(400).json({
        ok: false,
        message: 'Debes indicar un numero de ruta valido.'
      });
    }

    const data = await fetchRouteData(context, routeId);
    await saveUrbanoRouteCache({
      usuarioId: context.userId,
      sedeId: context.sedeId,
      routeId,
      payload: data
    });

    return res.json({
      ok: true,
      data
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error.message || 'No se pudo consultar la ruta en Urbano.'
    });
  }
}

export async function obtenerUltimaConsultaUrbano(req: AuthRequest, res: Response) {
  try {
    const userId = Number(req.user?.id);

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario no autenticado.'
      });
    }

    const data = await getLatestUrbanoRouteCache(userId);

    return res.json({
      ok: true,
      data
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error.message || 'No se pudo recuperar la ultima consulta temporal.'
    });
  }
}

export async function limpiarConsultaUrbano(req: AuthRequest, res: Response) {
  try {
    const userId = Number(req.user?.id);

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario no autenticado.'
      });
    }

    await clearUrbanoRouteCache(userId);

    return res.json({
      ok: true,
      message: 'Consulta temporal limpiada correctamente.'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error.message || 'No se pudo limpiar la consulta temporal.'
    });
  }
}
