import { describe, expect, it } from 'vitest';
import { resolveUserAvatar } from './user-avatar';

describe('resolveUserAvatar', () => {
  it('respeta la presentacion corporativa seleccionada', () => {
    const female = resolveUserAvatar({ foto: null, avatar_variant: 'female' });
    const male = resolveUserAvatar({ foto: null, avatar_variant: 'male' });

    expect(female).not.toBe(male);
  });

  it('prioriza una fotografia propia sobre el avatar corporativo', () => {
    expect(resolveUserAvatar({
      foto: '/storage/users/profile-photos/gerencia.webp',
      avatar_variant: 'female',
    })).toBe('/storage/users/profile-photos/gerencia.webp');
  });
});
