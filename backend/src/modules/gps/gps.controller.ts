// ============================================================
// backend/src/modules/gps/gps.controller.ts
// Controlador HTTP para reportes y consultas GPS
// ============================================================

import { Response } from 'express';
import { GpsService } from './services/GpsService';
import { AuthRequest } from '../../core/middlewares/authMiddleware';
import { assertEntitySede, resolveOptionalSedeScope, resolveSedeScope, SedeScopeError } from '../../core/auth/sedeScope';
import { businessDate } from '../../core/utils/time';

function errorStatus(error: unknown, fallback: number): number {
  return error instanceof SedeScopeError ? error.statusCode : fallback;
}

export class GpsController {
  constructor(private gpsService: GpsService) {}

  reportarUbicacion = async (req: AuthRequest, res: Response) => {
    try {
      const {
        empleado_id,
        latitud,
        longitud,
        velocidad_kmh,
        precision_gps,
        altitud,
        rumbo,
        estado_movimiento,
        porcentaje_bateria
      } = req.body;

      if (!empleado_id || latitud === undefined || longitud === undefined) {
        return res.status(400).json({
          ok: false,
          message: 'Empleado, latitud y longitud son requeridos'
        });
      }

      const empleadoId = Number(empleado_id);
      const empleadoSedeId = await this.gpsService.obtenerSedeEmpleado(empleadoId);
      assertEntitySede(req, empleadoSedeId);

      await this.gpsService.reportarUbicacion({
        empleadoId,
        latitud: Number(latitud),
        longitud: Number(longitud),
        velocidadKmh: Number(velocidad_kmh || 0),
        precisionGps: precision_gps === undefined || precision_gps === null ? null : Number(precision_gps),
        altitud: altitud === undefined || altitud === null ? null : Number(altitud),
        rumbo: rumbo === undefined || rumbo === null ? null : Number(rumbo),
        estadoMovimiento: (estado_movimiento as 'DETENIDO' | 'CAMINANDO' | 'VEHICULO') || 'DETENIDO',
        porcentajeBateria: porcentaje_bateria === undefined || porcentaje_bateria === null ? null : Number(porcentaje_bateria)
      });

      return res.json({
        ok: true,
        message: 'Ubicación GPS registrada correctamente'
      });
    } catch (error: any) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error.message
      });
    }
  };

  obtenerTiempoReal = async (req: AuthRequest, res: Response) => {
    try {
      const sedeId = resolveSedeScope(req, req.params.sedeId);
      const posiciones = await this.gpsService.obtenerUbicacionesTiempoReal(sedeId);
      return res.json({
        ok: true,
        data: posiciones
      });
    } catch (error: any) {
      return res.status(errorStatus(error, 500)).json({
        ok: false,
        message: error.message
      });
    }
  };

  obtenerTiempoRealCorporativo = async (req: AuthRequest, res: Response) => {
    try {
      const sedeId = resolveOptionalSedeScope(req, req.query.sede_id);
      const posiciones = await this.gpsService.obtenerUbicacionesTiempoReal(sedeId);
      return res.json({ ok: true, data: posiciones });
    } catch (error: any) {
      return res.status(errorStatus(error, 500)).json({
        ok: false,
        message: error.message
      });
    }
  };

  obtenerHistorial = async (req: AuthRequest, res: Response) => {
    try {
      const empleadoId = Number(req.params.empleadoId);
      const fecha = String(req.query.fecha || businessDate());
      const empleadoSedeId = await this.gpsService.obtenerSedeEmpleado(empleadoId);
      assertEntitySede(req, empleadoSedeId);

      const historial = await this.gpsService.obtenerHistorialRecorrido(empleadoId, fecha);
      return res.json({
        ok: true,
        data: historial
      });
    } catch (error: any) {
      return res.status(errorStatus(error, 400)).json({
        ok: false,
        message: error.message
      });
    }
  };
}
