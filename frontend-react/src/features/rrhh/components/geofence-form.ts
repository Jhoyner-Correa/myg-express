import type { Geofence } from '../types';

export type GeofenceDraft = {
  latitude: string;
  longitude: string;
  radius_meters: string;
  maximum_accuracy_meters: string;
};

type GeofenceInput = Omit<Geofence, 'site_id' | 'updated_at'>;

export type GeofenceFormResult =
  | { ok: true; value: GeofenceInput }
  | { ok: false; message: string };

function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateGeofenceDraft(draft: GeofenceDraft): GeofenceFormResult {
  const latitude = parseDecimal(draft.latitude);
  if (latitude === null || latitude < -90 || latitude > 90) {
    return { ok: false, message: 'Ingresa una latitud decimal válida entre -90 y 90. Ejemplo: -11.252721.' };
  }

  const longitude = parseDecimal(draft.longitude);
  if (longitude === null || longitude < -180 || longitude > 180) {
    return { ok: false, message: 'Ingresa una longitud decimal válida entre -180 y 180. Ejemplo: -74.638612.' };
  }

  const radiusMeters = parseDecimal(draft.radius_meters);
  if (radiusMeters === null || !Number.isInteger(radiusMeters) || radiusMeters < 10 || radiusMeters > 1000) {
    return { ok: false, message: 'El radio permitido debe ser un número entero entre 10 y 1000 metros.' };
  }

  const maximumAccuracyMeters = parseDecimal(draft.maximum_accuracy_meters);
  if (
    maximumAccuracyMeters === null
    || !Number.isInteger(maximumAccuracyMeters)
    || maximumAccuracyMeters < 5
    || maximumAccuracyMeters > 100
  ) {
    return { ok: false, message: 'La precisión GPS máxima debe ser un número entero entre 5 y 100 metros.' };
  }

  return {
    ok: true,
    value: {
      latitude,
      longitude,
      radius_meters: radiusMeters,
      maximum_accuracy_meters: maximumAccuracyMeters,
    },
  };
}
