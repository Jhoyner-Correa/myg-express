export type CapturedSiteLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: Date;
};

type CaptureOptions = {
  targetAccuracyMeters?: number;
  maximumAccuracyMeters?: number;
  timeoutMilliseconds?: number;
  maximumAgeMilliseconds?: number;
  onSample?: (sample: CapturedSiteLocation) => void;
};

export class SiteLocationCaptureError extends Error {
  readonly code: 'UNSUPPORTED' | 'PERMISSION' | 'UNAVAILABLE' | 'TIMEOUT' | 'INACCURATE';

  constructor(message: string, code: 'UNSUPPORTED' | 'PERMISSION' | 'UNAVAILABLE' | 'TIMEOUT' | 'INACCURATE') {
    super(message);
    this.code = code;
  }
}

function captureError(error: GeolocationPositionError): SiteLocationCaptureError {
  if (error.code === error.PERMISSION_DENIED) {
    return new SiteLocationCaptureError(
      'Autoriza la ubicación precisa del navegador para capturar el punto de esta sede.',
      'PERMISSION',
    );
  }
  if (error.code === error.TIMEOUT) {
    return new SiteLocationCaptureError('El GPS demoró demasiado. Acércate a una ventana o zona abierta e intenta nuevamente.', 'TIMEOUT');
  }
  return new SiteLocationCaptureError('No se pudo obtener la ubicación del dispositivo.', 'UNAVAILABLE');
}

export function capturePreciseSiteLocation(
  geolocation: Geolocation | undefined = globalThis.navigator?.geolocation,
  options: CaptureOptions = {},
): Promise<CapturedSiteLocation> {
  if (!geolocation) {
    return Promise.reject(new SiteLocationCaptureError('Este dispositivo no permite capturar la ubicación.', 'UNSUPPORTED'));
  }

  const targetAccuracy = options.targetAccuracyMeters ?? 15;
  const maximumAccuracy = options.maximumAccuracyMeters ?? 20;
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 18_000;
  const maximumAgeMilliseconds = options.maximumAgeMilliseconds ?? 15_000;

  return new Promise((resolve, reject) => {
    let watchId: number | null = null;
    let bestSample: CapturedSiteLocation | null = null;
    let settled = false;

    const stop = () => {
      if (watchId !== null) geolocation.clearWatch(watchId);
      globalThis.clearTimeout(timeoutId);
    };
    const succeed = (sample: CapturedSiteLocation) => {
      if (settled) return;
      settled = true;
      stop();
      resolve(sample);
    };
    const fail = (error: SiteLocationCaptureError) => {
      if (settled) return;
      settled = true;
      stop();
      reject(error);
    };

    const timeoutId = globalThis.setTimeout(() => {
      if (bestSample && bestSample.accuracyMeters <= maximumAccuracy) succeed(bestSample);
      else fail(new SiteLocationCaptureError(
        `La señal GPS no alcanzó la precisión requerida de ${maximumAccuracy} m. Intenta desde una zona abierta.`,
        'INACCURATE',
      ));
    }, timeoutMilliseconds);

    watchId = geolocation.watchPosition(position => {
      const capturedAt = new Date(position.timestamp);
      const ageMilliseconds = Date.now() - capturedAt.getTime();
      const sample = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        capturedAt,
      };
      if (
        !Number.isFinite(sample.latitude)
        || !Number.isFinite(sample.longitude)
        || !Number.isFinite(sample.accuracyMeters)
        || sample.accuracyMeters <= 0
        || ageMilliseconds < -5_000
        || ageMilliseconds > maximumAgeMilliseconds
      ) return;

      if (!bestSample || sample.accuracyMeters < bestSample.accuracyMeters) {
        bestSample = sample;
        options.onSample?.(sample);
      }
      if (sample.accuracyMeters <= targetAccuracy) succeed(sample);
    }, error => fail(captureError(error)), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: timeoutMilliseconds,
    });

    if (settled && watchId !== null) geolocation.clearWatch(watchId);
  });
}
