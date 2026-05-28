export function getSuperadminUsers(): string[] {
  const raw = process.env.SUPERADMIN_USERS || process.env.SUPERADMIN_USER || 'admin_master';

  return raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function esSuperadminUsuario(usuario?: string | null): boolean {
  if (!usuario) return false;
  return getSuperadminUsers().includes(String(usuario).trim().toLowerCase());
}
