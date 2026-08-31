const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveMobilePermissionPeriod,
} = require('../dist/modules/rrhh-mobile/mobilePermissionRequest.service');

test('normaliza un permiso de día completo sin confiar en horas del cliente', () => {
  assert.deepEqual(
    resolveMobilePermissionPeriod({
      duration_mode: 'FULL_DAY',
      request_date: '2026-08-28',
    }),
    {
      mode: 'FULL_DAY',
      start: '2026-08-28 00:00:00',
      end: '2026-08-28 23:59:59',
    },
  );
});
test('acepta permisos por horas solo dentro de la misma fecha', () => {
  assert.deepEqual(
    resolveMobilePermissionPeriod({
      duration_mode: 'HOURS',
      start_at: '2026-08-28T09:30',
      end_at: '2026-08-28T12:00',
    }),
    {
      mode: 'HOURS',
      start: '2026-08-28 09:30:00',
      end: '2026-08-28 12:00:00',
    },
  );
  assert.throws(
    () =>
      resolveMobilePermissionPeriod({
        duration_mode: 'HOURS',
        start_at: '2026-08-28T23:00',
        end_at: '2026-08-29T01:00',
      }),
    /mismo día/,
  );
});
