export const SYSTEM_PASSWORD_MIN_LENGTH = 4;
export const SYSTEM_PASSWORD_MAX_BYTES = 72;

export class PasswordPolicyError extends Error {}

/**
 * Política común para las contraseñas del panel administrativo.
 * El límite superior evita el truncamiento silencioso de bcrypt.
 */
export function validateSystemPassword(value: unknown): string {
  const password = String(value ?? '');
  const byteLength = Buffer.byteLength(password, 'utf8');

  if (password.length < SYSTEM_PASSWORD_MIN_LENGTH || byteLength > SYSTEM_PASSWORD_MAX_BYTES) {
    throw new PasswordPolicyError(
      `La contraseña debe tener entre ${SYSTEM_PASSWORD_MIN_LENGTH} y ${SYSTEM_PASSWORD_MAX_BYTES} caracteres.`,
    );
  }

  return password;
}
