const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AttendanceRuleError,
  allowedNextClockTypes,
  assertClockTransition,
  distanceMeters,
  validateGeofence,
  assertGeofenceDefinition,
  buildClockActions,
  assertClockTimeWindow,
  classifyClockTiming,
  resolveEntryAttendance,
} = require('../dist/modules/rrhh/domain/attendancePolicy');

const splitSchedule = {
  startTime: '09:00:00', endTime: '19:00:00', toleranceMinutes: 0,
  lunchEnabled: true, lunchStartFrom: '13:00:00', lunchDurationMinutes: 120,
  returnToleranceMinutes: 0, entryOpenBeforeMinutes: 60,
  lunchOpenBeforeMinutes: 30, returnOpenBeforeMinutes: 30,
  exitOpenBeforeMinutes: 30, overtimeThresholdMinutes: 10,
};

test('la jornada exige entrada como primera marcacion', () => {
  assert.deepEqual(allowedNextClockTypes([]), ['ENTRADA']);
  assert.throws(
    () => assertClockTransition([], 'SALIDA'),
    (error) => error instanceof AttendanceRuleError && error.code === 'INVALID_CLOCK_SEQUENCE',
  );
});

test('permite salida directa cuando el empleado no toma almuerzo', () => {
  assert.deepEqual(allowedNextClockTypes(['ENTRADA']), ['SALIDA_ALMUERZO', 'SALIDA']);
  assert.doesNotThrow(() => assertClockTransition(['ENTRADA'], 'SALIDA'));
});

test('oculta acciones de almuerzo cuando la política no las habilita', () => {
  assert.deepEqual(allowedNextClockTypes(['ENTRADA'], false), ['SALIDA']);
  assert.throws(
    () => assertClockTransition(['ENTRADA'], 'SALIDA_ALMUERZO', false),
    (error) => error instanceof AttendanceRuleError && error.code === 'INVALID_CLOCK_SEQUENCE',
  );
});

test('no permite duplicar una marcacion', () => {
  assert.throws(
    () => assertClockTransition(['ENTRADA'], 'ENTRADA'),
    (error) => error instanceof AttendanceRuleError && error.code === 'CLOCK_ALREADY_RECORDED',
  );
});

test('obliga a regresar del almuerzo antes de la salida final', () => {
  assert.deepEqual(allowedNextClockTypes(['ENTRADA', 'SALIDA_ALMUERZO']), ['REGRESO']);
  assert.throws(
    () => assertClockTransition(['ENTRADA', 'SALIDA_ALMUERZO'], 'SALIDA'),
    (error) => error instanceof AttendanceRuleError && error.code === 'INVALID_CLOCK_SEQUENCE',
  );
});

test('calcula distancia geografica en metros', () => {
  const distance = distanceMeters(
    { latitude: -12.06513, longitude: -75.20486 },
    { latitude: -12.06468, longitude: -75.20486 },
  );
  assert.ok(distance > 49 && distance < 51);
});

test('rechaza marcacion sin configuracion de geocerca', () => {
  assert.throws(
    () => validateGeofence({ latitude: -12, longitude: -75 }, 10, null),
    (error) => error instanceof AttendanceRuleError && error.code === 'GEOFENCE_NOT_CONFIGURED',
  );
});

test('rechaza GPS impreciso aunque la coordenada este dentro', () => {
  assert.throws(
    () => validateGeofence(
      { latitude: -12, longitude: -75 },
      80,
      { latitude: -12, longitude: -75, radiusMeters: 50, maximumAccuracyMeters: 30 },
    ),
    (error) => error instanceof AttendanceRuleError && error.code === 'GPS_ACCURACY_INSUFFICIENT',
  );
});

test('acepta una posicion precisa dentro de la geocerca', () => {
  const result = validateGeofence(
    { latitude: -12, longitude: -75 },
    8,
    { latitude: -12, longitude: -75, radiusMeters: 50, maximumAccuracyMeters: 30 },
  );
  assert.equal(result.inside, true);
  assert.equal(result.distanceMeters, 0);
});

test('rechaza configuraciones de geocerca operativamente inseguras', () => {
  assert.throws(
    () => assertGeofenceDefinition({ latitude: -12, longitude: -75, radiusMeters: 2, maximumAccuracyMeters: 30 }),
    (error) => error instanceof AttendanceRuleError && error.code === 'GEOFENCE_NOT_CONFIGURED',
  );
});

test('activa cada marcacion en su ventana sin alterar la hora real', () => {
  const atEight = buildClockActions([], splitSchedule, 8 * 60);
  assert.equal(atEight.find(action => action.type === 'ENTRADA').enabled, true);
  assert.equal(atEight.find(action => action.type === 'ENTRADA').scheduledTime, '09:00:00');

  const beforeLunch = buildClockActions(['ENTRADA'], splitSchedule, (12 * 60) + 29);
  assert.equal(beforeLunch.find(action => action.type === 'SALIDA_ALMUERZO').enabled, false);
  assert.equal(beforeLunch.find(action => action.type === 'SALIDA').enabled, false);
  assert.throws(
    () => assertClockTimeWindow(['ENTRADA'], 'SALIDA', splitSchedule, 12 * 60),
    error => error instanceof AttendanceRuleError && error.code === 'CLOCK_NOT_YET_AVAILABLE',
  );
});

test('calcula regreso fijo, tardanza sin tolerancia y sobretiempo candidato', () => {
  const entry = classifyClockTiming('ENTRADA', (9 * 60) + 1, splitSchedule);
  assert.equal(entry.differenceMinutes, 1);
  assert.equal(entry.classification, 'TARDANZA');

  const lunch = classifyClockTiming('SALIDA_ALMUERZO', (13 * 60) + 5, splitSchedule);
  assert.equal(lunch.differenceMinutes, 5);
  assert.equal(lunch.classification, 'DEMORADA');

  const returned = classifyClockTiming('REGRESO', (15 * 60) + 1, splitSchedule);
  assert.equal(returned.differenceMinutes, 1);
  assert.equal(returned.classification, 'TARDANZA');

  const exit = classifyClockTiming('SALIDA', (19 * 60) + 10, splitSchedule);
  assert.equal(exit.classification, 'SOBRETIEMPO_CANDIDATO');
});

test('resuelve presencia y tardanza desde el horario y la tolerancia', () => {
  const withTolerance = { ...splitSchedule, toleranceMinutes: 10 };

  assert.deepEqual(resolveEntryAttendance((8 * 60) + 30, withTolerance), {
    status: 'PRESENTE',
    delayMinutes: 0,
    timing: { scheduledMinutes: 540, differenceMinutes: -30, classification: 'ANTICIPADA' },
  });
  assert.deepEqual(resolveEntryAttendance((9 * 60) + 8, withTolerance), {
    status: 'PRESENTE',
    delayMinutes: 0,
    timing: { scheduledMinutes: 540, differenceMinutes: 8, classification: 'PUNTUAL' },
  });
  assert.deepEqual(resolveEntryAttendance((9 * 60) + 11, withTolerance), {
    status: 'TARDANZA',
    delayMinutes: 11,
    timing: { scheduledMinutes: 540, differenceMinutes: 11, classification: 'TARDANZA' },
  });
});
