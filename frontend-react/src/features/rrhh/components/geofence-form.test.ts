import { describe, expect, it } from 'vitest';
import { validateGeofenceDraft } from './geofence-form';

const validDraft = {
  latitude: '-11.252721',
  longitude: '-74.638612',
  radius_meters: '50',
  maximum_accuracy_meters: '30',
};

describe('validateGeofenceDraft', () => {
  it('normaliza coordenadas escritas con coma decimal', () => {
    const result = validateGeofenceDraft({
      ...validDraft,
      latitude: '-11,252721',
      longitude: '-74,638612',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        latitude: -11.252721,
        longitude: -74.638612,
        radius_meters: 50,
        maximum_accuracy_meters: 30,
      },
    });
  });

  it('rechaza coordenadas vacías o fuera del rango geográfico', () => {
    expect(validateGeofenceDraft({ ...validDraft, latitude: '' })).toMatchObject({ ok: false });
    expect(validateGeofenceDraft({ ...validDraft, longitude: '-181' })).toMatchObject({ ok: false });
  });

  it('aplica los mismos límites operativos que la API', () => {
    expect(validateGeofenceDraft({ ...validDraft, radius_meters: '1001' })).toEqual({
      ok: false,
      message: 'El radio permitido debe ser un número entero entre 10 y 1000 metros.',
    });
    expect(validateGeofenceDraft({ ...validDraft, maximum_accuracy_meters: '101' })).toEqual({
      ok: false,
      message: 'La precisión GPS máxima debe ser un número entero entre 5 y 100 metros.',
    });
  });
});
