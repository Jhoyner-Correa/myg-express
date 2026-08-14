const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AttendanceRuleError,
  allowedNextClockTypes,
  assertClockTransition,
  distanceMeters,
  validateGeofence,
  assertGeofenceDefinition,
} = require('../dist/modules/rrhh/domain/attendancePolicy');

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
