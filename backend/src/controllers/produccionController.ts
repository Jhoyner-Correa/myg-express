import { Response } from 'express';

import { AuthRequest } from '../middlewares/authMiddleware';
import {
  fetchRouteData,
  getUrbanoStatus,
  loginToUrbano,
  logoutFromUrbano
} from '../services/urbanoService';

export async function conectarUrbano(req: AuthRequest, res: Response) {
  try {
    const userId = Number(req.user?.id);
    const bodyUsername = req.body?.username;
    const bodyPassword = req.body?.password;
    const envUsername = process.env.URBANO_USERNAME;
    const envPassword = process.env.URBANO_PASSWORD;
    const username = String(bodyUsername || envUsername || '').trim();
    const password = String(bodyPassword || envPassword || '').trim();

    if (!userId || !username || !password) {
      return res.status(400).json({
        ok: false,
        message: 'La integración de Urbano no está configurada en el servidor. Configura URBANO_USERNAME y URBANO_PASSWORD en backend/.env.'
      });
    }

    const data = await loginToUrbano(userId, String(username), String(password));

    return res.json({
      ok: true,
      message: 'Conexion a Urbano establecida correctamente.',
      data
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: error.message || 'No se pudo conectar con Urbano.'
    });
  }
}

export function estadoUrbano(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id);

  return res.json({
    ok: true,
    data: getUrbanoStatus(userId)
  });
}

export function cerrarUrbano(req: AuthRequest, res: Response) {
  const userId = Number(req.user?.id);

  return res.json({
    ok: true,
    message: 'Sesion de Urbano cerrada.',
    data: logoutFromUrbano(userId)
  });
}

export async function consultarRutaUrbano(req: AuthRequest, res: Response) {
  try {
    const userId = Number(req.user?.id);
    const routeId = String(req.params.routeId || '').trim();

    if (!userId || !routeId) {
      return res.status(400).json({
        ok: false,
        message: 'Debes indicar un ID de ruta valido.'
      });
    }

    const data = await fetchRouteData(userId, routeId);

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
