const INTERNAL_DEMO_PREFIX = '[SEED_RRHH_DEMO]';

export function publicJobRoleDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const description = value.trim();
  if (!description) return null;
  const publicDescription = description.startsWith(INTERNAL_DEMO_PREFIX)
    ? description.slice(INTERNAL_DEMO_PREFIX.length).trim()
    : description;
  return publicDescription || null;
}
