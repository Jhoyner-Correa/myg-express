import executiveFemaleAvatar from '../../assets/avatars/executive-avatar-female.png';
import executiveMaleAvatar from '../../assets/avatars/executive-avatar-male.png';
import type { UserSession } from './authState';

export type ExecutiveAvatarVariant = 'female' | 'male';

const executiveAvatars: Record<ExecutiveAvatarVariant, string> = {
  female: executiveFemaleAvatar,
  male: executiveMaleAvatar,
};

/**
 * Resolves the system-user avatar without duplicating fallback rules in the UI.
 * A user-uploaded photo always has priority over the corporate illustration.
 */
export function resolveUserAvatar(
  user: Pick<UserSession, 'foto'> | null | undefined,
  fallback: ExecutiveAvatarVariant = 'male',
) {
  return user?.foto?.trim() || executiveAvatars[fallback];
}
