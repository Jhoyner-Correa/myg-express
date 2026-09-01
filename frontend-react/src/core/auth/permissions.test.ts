import { describe, expect, it } from 'vitest';
import { PERMISSIONS, userHasPermission } from './permissions';

describe('userHasPermission', () => {
  it('respeta los permisos explícitos del usuario', () => {
    const user = { permisos: [PERMISSIONS.ROUTES_VIEW] };
    expect(userHasPermission(user, PERMISSIONS.ROUTES_VIEW)).toBe(true);
    expect(userHasPermission(user, PERMISSIONS.ROUTES_MANAGE)).toBe(false);
  });

  it('no concede permisos implícitos mediante una bandera administrativa', () => {
    expect(userHasPermission({ permisos: [] }, PERMISSIONS.ROUTES_MANAGE)).toBe(false);
    expect(userHasPermission(
      { permisos: [PERMISSIONS.ROUTES_MANAGE] },
      PERMISSIONS.ROUTES_MANAGE,
    )).toBe(true);
  });

  it('distingue control de asistencia, consulta de pagos y ejecucion de pagos', () => {
    const supervisor = {
      permisos: [PERMISSIONS.RRHH_VIEW, PERMISSIONS.RRHH_ATTENDANCE_MANAGE],
    };

    expect(userHasPermission(supervisor, PERMISSIONS.RRHH_ATTENDANCE_MANAGE)).toBe(true);
    expect(userHasPermission(supervisor, PERMISSIONS.RRHH_PAYMENTS_VIEW)).toBe(false);
    expect(userHasPermission(supervisor, PERMISSIONS.RRHH_PAYMENTS_MANAGE)).toBe(false);
  });
});
