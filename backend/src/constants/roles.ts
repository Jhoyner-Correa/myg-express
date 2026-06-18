export const ROLES = {
  SYSADMIN: 'SysAdmin',
  ADMIN_EMPRESA: 'AdminEmpresa',
  ENCARGADO_OFICINA: 'EncargadoOficina'
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

const ROLE_ALIASES: Record<string, AppRole> = {
  sysadmin: ROLES.SYSADMIN,
  'administrador de sistemas (sysadmin)': ROLES.SYSADMIN,
  adminempresa: ROLES.ADMIN_EMPRESA,
  'admin empresa': ROLES.ADMIN_EMPRESA,
  'administrador general': ROLES.ADMIN_EMPRESA,
  encargadooficina: ROLES.ENCARGADO_OFICINA,
  'encargado oficina': ROLES.ENCARGADO_OFICINA,
  'encargado de oficina': ROLES.ENCARGADO_OFICINA,
  admin: ROLES.ENCARGADO_OFICINA
};

export const MANAGED_USER_ROLES: AppRole[] = [
  ROLES.ADMIN_EMPRESA,
  ROLES.ENCARGADO_OFICINA
];

export function normalizeRole(value: unknown, forceSysAdmin = false): AppRole {
  if (forceSysAdmin) return ROLES.SYSADMIN;

  const raw = String(value || '').trim();
  if (!raw) return ROLES.ENCARGADO_OFICINA;

  const compact = raw.toLowerCase().replace(/[\s_-]+/g, '');
  const lowered = raw.toLowerCase();

  return ROLE_ALIASES[compact] || ROLE_ALIASES[lowered] || ROLES.ENCARGADO_OFICINA;
}

export function isManagedUserRole(value: unknown): boolean {
  return MANAGED_USER_ROLES.includes(normalizeRole(value));
}

export function roleRequiresSede(role: AppRole): boolean {
  return role === ROLES.ENCARGADO_OFICINA;
}

export function getRoleLabel(role: AppRole): string {
  if (role === ROLES.SYSADMIN) return 'Administrador del Sistema';
  if (role === ROLES.ADMIN_EMPRESA) return 'Administrador General';
  return 'Encargado de Oficina';
}
