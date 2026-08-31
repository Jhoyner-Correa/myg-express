import { ClockTimingClassification, ClockType } from './Marcacion';

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
  | 'CLOCK_NOT_YET_AVAILABLE'
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

export type AttendanceWindowSchedule = {
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
  lunchEnabled: boolean;
  lunchStartFrom: string | null;
  lunchDurationMinutes: number;
  returnToleranceMinutes: number;
  entryOpenBeforeMinutes: number;
  lunchOpenBeforeMinutes: number;
  returnOpenBeforeMinutes: number;
  exitOpenBeforeMinutes: number;
  overtimeThresholdMinutes: number;
};

export type ClockActionState = {
  type: ClockType;
  state: 'COMPLETED' | 'BLOCKED_SEQUENCE' | 'UPCOMING' | 'AVAILABLE';
  enabled: boolean;
  scheduledTime: string;
  availableFrom: string;
  minutesUntil: number;
};

function clockMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value).trim());
  if (!match) throw new Error('Hora de horario invalida');
  return (Number(match[1]) * 60) + Number(match[2]);
}

function clockText(minutes: number): string {
  const bounded = Math.max(0, Math.min(1439, minutes));
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}:00`;
}

export function scheduledClockMinutes(type: ClockType, schedule: AttendanceWindowSchedule): number {
  if (type === 'ENTRADA') return clockMinutes(schedule.startTime);
  if (type === 'SALIDA') return clockMinutes(schedule.endTime);
  if (!schedule.lunchEnabled || !schedule.lunchStartFrom) {
    throw new AttendanceRuleError('LUNCH_NOT_CONFIGURED', 'El horario no tiene almuerzo configurado.', 409);
  }
  const lunchStart = clockMinutes(schedule.lunchStartFrom);
  return type === 'SALIDA_ALMUERZO' ? lunchStart : lunchStart + schedule.lunchDurationMinutes;
}

function openingMinutes(type: ClockType, schedule: AttendanceWindowSchedule): number {
  if (type === 'ENTRADA') return schedule.entryOpenBeforeMinutes;
  if (type === 'SALIDA_ALMUERZO') return schedule.lunchOpenBeforeMinutes;
  if (type === 'REGRESO') return schedule.returnOpenBeforeMinutes;
  return schedule.exitOpenBeforeMinutes;
}

export function buildClockActions(
  recorded: ClockType[],
  schedule: AttendanceWindowSchedule,
  currentMinutes: number,
): ClockActionState[] {
  const sequenceAllowed = allowedNextClockTypes(recorded, schedule.lunchEnabled);
  const visible = schedule.lunchEnabled ? CLOCK_TYPES : ['ENTRADA', 'SALIDA'] as ClockType[];
  return visible.map(type => {
    const scheduled = scheduledClockMinutes(type, schedule);
    const available = Math.max(0, scheduled - openingMinutes(type, schedule));
    const completed = recorded.includes(type);
    const inSequence = sequenceAllowed.includes(type);
    const enabled = inSequence && currentMinutes >= available;
    return {
      type,
      state: completed ? 'COMPLETED' : !inSequence ? 'BLOCKED_SEQUENCE' : enabled ? 'AVAILABLE' : 'UPCOMING',
      enabled,
      scheduledTime: clockText(scheduled),
      availableFrom: clockText(available),
      minutesUntil: enabled ? 0 : Math.max(0, available - currentMinutes),
    };
  });
}

export function assertClockTimeWindow(
  recorded: ClockType[],
  requested: ClockType,
  schedule: AttendanceWindowSchedule,
  currentMinutes: number,
): void {
  const action = buildClockActions(recorded, schedule, currentMinutes).find(value => value.type === requested);
  if (!action || action.state === 'BLOCKED_SEQUENCE') return;
  if (!action.enabled) {
    throw new AttendanceRuleError(
      'CLOCK_NOT_YET_AVAILABLE',
      `Esta marcacion se habilita a las ${action.availableFrom.slice(0, 5)}.`,
      409,
    );
  }
}

export function classifyClockTiming(
  type: ClockType,
  currentMinutes: number,
  schedule: AttendanceWindowSchedule,
): { scheduledMinutes: number; differenceMinutes: number; classification: ClockTimingClassification } {
  const scheduledMinutes = scheduledClockMinutes(type, schedule);
  const differenceMinutes = currentMinutes - scheduledMinutes;
  let classification: ClockTimingClassification = 'PUNTUAL';
  if (type === 'ENTRADA') {
    classification = differenceMinutes < 0 ? 'ANTICIPADA'
      : differenceMinutes > schedule.toleranceMinutes ? 'TARDANZA' : 'PUNTUAL';
  } else if (type === 'REGRESO') {
    classification = differenceMinutes < 0 ? 'ANTICIPADA'
      : differenceMinutes > schedule.returnToleranceMinutes ? 'TARDANZA' : 'PUNTUAL';
  } else if (type === 'SALIDA_ALMUERZO') {
    classification = differenceMinutes < 0 ? 'ANTICIPADA' : differenceMinutes > 0 ? 'DEMORADA' : 'PUNTUAL';
  } else {
    classification = differenceMinutes < 0 ? 'SALIDA_ANTICIPADA'
      : differenceMinutes >= schedule.overtimeThresholdMinutes ? 'SOBRETIEMPO_CANDIDATO' : 'PUNTUAL';
  }
  return { scheduledMinutes, differenceMinutes, classification };
}

export function resolveEntryAttendance(
  currentMinutes: number,
  schedule: AttendanceWindowSchedule,
): {
  status: 'PRESENTE' | 'TARDANZA';
  delayMinutes: number;
  timing: ReturnType<typeof classifyClockTiming>;
} {
  const timing = classifyClockTiming('ENTRADA', currentMinutes, schedule);
  const late = timing.classification === 'TARDANZA';
  return {
    status: late ? 'TARDANZA' : 'PRESENTE',
    delayMinutes: late ? Math.max(0, timing.differenceMinutes) : 0,
    timing,
  };
}

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
