import { ClockType } from './Marcacion';

export type AttendanceRuleCode =
  | 'REQUEST_ID_INVALID'
  | 'EMPLOYEE_NOT_FOUND'
  | 'EMPLOYEE_INACTIVE'
  | 'INVALID_CLOCK_TYPE'
  | 'INVALID_CLOCK_SEQUENCE'
  | 'CLOCK_ALREADY_RECORDED'
  | 'LUNCH_NOT_CONFIGURED'
  | 'GEOFENCE_NOT_CONFIGURED'
  | 'INVALID_COORDINATES'
  | 'INVALID_CAPTURE_TIME'
  | 'NON_WORKING_DAY'
  | 'SCHEDULE_NOT_ASSIGNED'
  | 'GPS_ACCURACY_REQUIRED'
  | 'GPS_ACCURACY_INSUFFICIENT'
  | 'OUTSIDE_GEOFENCE';

export class AttendanceRuleError extends Error {
  constructor(
    public readonly code: AttendanceRuleCode,
    message: string,
    public readonly statusCode = 422,
  ) {
    super(message);
    this.name = 'AttendanceRuleError';
  }
}

const CLOCK_TYPES: ClockType[] = ['ENTRADA', 'SALIDA_ALMUERZO', 'REGRESO', 'SALIDA'];

export function isClockType(value: unknown): value is ClockType {
  return typeof value === 'string' && CLOCK_TYPES.includes(value as ClockType);
}

export function allowedNextClockTypes(recorded: ClockType[], lunchEnabled = true): ClockType[] {
  if (recorded.includes('SALIDA')) return [];
  if (recorded.length === 0) return ['ENTRADA'];
  if (!recorded.includes('ENTRADA')) return [];
  if (!recorded.includes('SALIDA_ALMUERZO')) return lunchEnabled ? ['SALIDA_ALMUERZO', 'SALIDA'] : ['SALIDA'];
  if (!recorded.includes('REGRESO')) return ['REGRESO'];
  return ['SALIDA'];
}

export function assertClockTransition(recorded: ClockType[], requested: unknown, lunchEnabled = true): asserts requested is ClockType {
  if (!isClockType(requested)) {
    throw new AttendanceRuleError('INVALID_CLOCK_TYPE', 'El tipo de marcacion no es valido.', 400);
  }
  if (recorded.includes(requested)) {
    throw new AttendanceRuleError(
      'CLOCK_ALREADY_RECORDED',
      'Esta marcacion ya fue registrada para la jornada de hoy.',
      409,
    );
  }

  const allowed = allowedNextClockTypes(recorded, lunchEnabled);
  if (!allowed.includes(requested)) {
    const expected = allowed.length ? allowed.join(' o ') : 'ninguna marcacion adicional';
    throw new AttendanceRuleError(
      'INVALID_CLOCK_SEQUENCE',
      `La secuencia de asistencia no es valida. Corresponde: ${expected}.`,
      409,
    );
  }
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Geofence extends Coordinates {
  radiusMeters: number;
  maximumAccuracyMeters: number;
}

export interface GeofenceValidation {
  distanceMeters: number;
  inside: true;
}

export function assertGeofenceDefinition(geofence: Geofence): void {
  assertCoordinates(geofence);
  if (!Number.isFinite(geofence.radiusMeters) || geofence.radiusMeters < 10 || geofence.radiusMeters > 1000) {
    throw new AttendanceRuleError('GEOFENCE_NOT_CONFIGURED', 'El radio permitido debe estar entre 10 y 1000 metros.', 400);
  }
  if (
    !Number.isFinite(geofence.maximumAccuracyMeters)
    || geofence.maximumAccuracyMeters < 5
    || geofence.maximumAccuracyMeters > 100
  ) {
    throw new AttendanceRuleError('GEOFENCE_NOT_CONFIGURED', 'La precision maxima debe estar entre 5 y 100 metros.', 400);
  }
}

function assertCoordinates({ latitude, longitude }: Coordinates) {
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    throw new AttendanceRuleError('INVALID_COORDINATES', 'Las coordenadas GPS no son validas.', 400);
  }
}

export function distanceMeters(origin: Coordinates, destination: Coordinates): number {
  assertCoordinates(origin);
  assertCoordinates(destination);

  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(origin.latitude))
    * Math.cos(toRadians(destination.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validateGeofence(
  position: Coordinates,
  accuracyMeters: number | null,
  geofence: Geofence | null,
): GeofenceValidation {
  assertCoordinates(position);
  if (!geofence) {
    throw new AttendanceRuleError(
      'GEOFENCE_NOT_CONFIGURED',
      'La sede no tiene una geocerca configurada. Contacta al administrador.',
      409,
    );
  }
  assertGeofenceDefinition(geofence);
  if (accuracyMeters === null || !Number.isFinite(accuracyMeters) || accuracyMeters <= 0) {
    throw new AttendanceRuleError('GPS_ACCURACY_REQUIRED', 'No fue posible validar la precision del GPS.');
  }
  if (accuracyMeters > geofence.maximumAccuracyMeters) {
    throw new AttendanceRuleError(
      'GPS_ACCURACY_INSUFFICIENT',
      'La senal GPS no tiene precision suficiente. Acercate a una zona abierta e intenta otra vez.',
    );
  }

  const measuredDistance = distanceMeters(position, geofence);
  if (measuredDistance > geofence.radiusMeters) {
    throw new AttendanceRuleError(
      'OUTSIDE_GEOFENCE',
      `Estas fuera del area autorizada por ${Math.ceil(measuredDistance - geofence.radiusMeters)} metros.`,
    );
  }

  return { distanceMeters: measuredDistance, inside: true };
}
