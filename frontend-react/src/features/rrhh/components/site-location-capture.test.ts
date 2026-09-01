import { describe, expect, it, vi } from 'vitest';
import { capturePreciseSiteLocation, SiteLocationCaptureError } from './site-location-capture';

function position(latitude: number, longitude: number, accuracy: number): GeolocationPosition {
  return {
    coords: { latitude, longitude, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null, toJSON: () => ({}) },
    timestamp: Date.now(),
    toJSON: () => ({}),
  };
}

describe('capturePreciseSiteLocation', () => {
  it('conserva la mejor muestra y termina cuando alcanza la precisión objetivo', async () => {
    const clearWatch = vi.fn();
    const geolocation = {
      watchPosition: (success: PositionCallback) => {
        queueMicrotask(() => {
          success(position(-11.25, -74.64, 28));
          success(position(-11.251, -74.641, 12));
        });
        return 7;
      },
      clearWatch,
    } as unknown as Geolocation;

    await expect(capturePreciseSiteLocation(geolocation, { timeoutMilliseconds: 100 })).resolves.toMatchObject({
      latitude: -11.251,
      longitude: -74.641,
      accuracyMeters: 12,
    });
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('rechaza una señal que nunca alcanza la precisión operativa', async () => {
    const geolocation = {
      watchPosition: (success: PositionCallback) => {
        queueMicrotask(() => success(position(-11.25, -74.64, 80)));
        return 3;
      },
      clearWatch: vi.fn(),
    } as unknown as Geolocation;

    await expect(capturePreciseSiteLocation(geolocation, { timeoutMilliseconds: 5 })).rejects.toMatchObject({
      code: 'INACCURATE',
    } satisfies Partial<SiteLocationCaptureError>);
  });
});
