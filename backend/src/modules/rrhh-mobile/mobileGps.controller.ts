import { Response } from 'express';
import { MySqlGpsRepository } from '../gps/repositories/mysql/MySqlGpsRepository';
import { GpsService } from '../gps/services/GpsService';
import { MobileAuthRequest } from './mobileAuth.middleware';
import { createMobileGpsToken, gpsTrackingTokenTtlSeconds } from './mobileTokens';

export class MobileGpsController {
  constructor(
    private readonly gpsService = new GpsService(new MySqlGpsRepository()),
  ) {}

  issueTrackingCredential = async (req: MobileAuthRequest, res: Response) => {
    if (!req.employee) {
      return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Sesion requerida.' });
    }
    if (req.employee.requiresPasswordChange) {
      return res.status(403).json({
        ok: false,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Actualiza tu contrasena antes de iniciar el rastreo.',
      });
    }
    try {
      await this.gpsService.validarRastreoActivo(req.employee.id);
      const ttlSeconds = gpsTrackingTokenTtlSeconds();
      return res.json({
        ok: true,
        data: {
          token: createMobileGpsToken(req.employee.id, req.employee.deviceId, req.employee.sessionId),
          endpoint: '/gps/native/position',
          expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          interval_seconds: 30,
          distance_meters: 15,
        },
      });
    } catch (error) {
      return trackingBusinessError(res, error);
    }
  };

  reportPosition = async (req: MobileAuthRequest, res: Response) => {
    try {
      if (!req.employee) {
        return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED', message: 'Sesion requerida.' });
      }
      if (req.employee.requiresPasswordChange) {
        return res.status(403).json({
          ok: false,
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'Actualiza tu contrasena antes de iniciar el rastreo.',
        });
      }

      await this.gpsService.reportarUbicacion({
        empleadoId: req.employee.id,
        latitud: requiredNumber(req.body.latitud),
        longitud: requiredNumber(req.body.longitud),
        velocidadKmh: optionalNumber(req.body.velocidad_kmh, 0),
        precisionGps: nullableNumber(req.body.precision_gps),
        altitud: nullableNumber(req.body.altitud),
        rumbo: nullableNumber(req.body.rumbo),
        estadoMovimiento: String(req.body.estado_movimiento || 'DETENIDO') as 'DETENIDO' | 'CAMINANDO' | 'VEHICULO',
        porcentajeBateria: nullableNumber(req.body.porcentaje_bateria),
        ubicacionSimulada: booleanValue(req.body.ubicacion_simulada),
        capturadoEn: capturedDate(req.body.capturado_en),
      });

      return res.status(202).json({
        ok: true,
        data: { accepted: true },
        message: 'Posicion recibida.',
      });
    } catch (error) {
      return trackingBusinessError(res, error);
    }
  };
}

function capturedDate(value: unknown): Date {
  if (!value) return new Date();
  const date = new Date(String(value));
  return date;
}

function trackingBusinessError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'No se pudo registrar la posicion.';
  const shiftInactive = message === 'El rastreo requiere una jornada activa';
  const trackingDisabled = message === 'El colaborador no tiene habilitado el rastreo continuo';
  const simulated = message === 'No se aceptan ubicaciones simuladas';
  return res.status(shiftInactive ? 409 : trackingDisabled || simulated ? 403 : 422).json({
    ok: false,
    code: shiftInactive
      ? 'TRACKING_SHIFT_INACTIVE'
      : trackingDisabled
      ? 'TRACKING_NOT_ENABLED'
      : simulated
      ? 'MOCK_LOCATION_REJECTED'
      : 'INVALID_GPS_POSITION',
    message,
  });
}

function nullableNumber(value: unknown): number | null {
  return value === undefined || value === null || value === '' ? null : Number(value);
}

function requiredNumber(value: unknown): number {
  return value === undefined || value === null || value === '' ? Number.NaN : Number(value);
}

function optionalNumber(value: unknown, fallback: number): number {
  return value === undefined || value === null || value === '' ? fallback : Number(value);
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || String(value).trim().toLowerCase() === 'true';
}
