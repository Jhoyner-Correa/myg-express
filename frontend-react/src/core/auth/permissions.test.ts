import { describe, expect, it } from 'vitest';
import { PERMISSIONS, userHasPermission } from './permissions';

describe('userHasPermission', () => {
  it('respeta los permisos explícitos del usuario', () => {
    const user = { es_superadmin: false, permisos: [PERMISSIONS.ROUTES_VIEW] };
    expect(userHasPermission(user, PERMISSIONS.ROUTES_VIEW)).toBe(true);
    expect(userHasPermission(user, PERMISSIONS.ROUTES_MANAGE)).toBe(false);
  });

  it('permite todas las acciones al superadministrador', () => {
    expect(userHasPermission({ es_superadmin: true, permisos: [] }, PERMISSIONS.ROUTES_MANAGE)).toBe(true);
  });
});
