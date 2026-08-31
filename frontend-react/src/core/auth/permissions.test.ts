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
});
