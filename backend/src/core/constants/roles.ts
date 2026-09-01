export const ROLES = {
  SYSADMIN: 'SysAdmin',
  ADMIN_EMPRESA: 'AdminEmpresa',
  GERENTE_EMPRESA: 'GerenteEmpresa',
  SUPERVISOR_SEDE: 'SupervisorSede',
  ENCARGADO_OFICINA: 'EncargadoOficina'
} as const;

export type AppRole = (typeof ROLES)[keyof typeof ROLES];

export const USER_TYPES = {
  SYSTEM: 'SISTEMA',
  COMPANY: 'EMPRESA'
} as const;

export type UserType = (typeof USER_TYPES)[keyof typeof USER_TYPES];

export const ACCESS_SCOPES = {
  SYSTEM: 'SISTEMA',
  COMPANY: 'EMPRESA',
  SITE: 'SEDE'
} as const;

export type AccessScope = (typeof ACCESS_SCOPES)[keyof typeof ACCESS_SCOPES];

const ROLE_ALIASES: Record<string, AppRole> = {
  sysadmin: ROLES.SYSADMIN,
  'administrador de sistemas (sysadmin)': ROLES.SYSADMIN,
  adminempresa: ROLES.ADMIN_EMPRESA,
  'admin empresa': ROLES.ADMIN_EMPRESA,
  'administrador general': ROLES.ADMIN_EMPRESA,
  gerenteempresa: ROLES.GERENTE_EMPRESA,
  gerente: ROLES.GERENTE_EMPRESA,
  supervisorsede: ROLES.SUPERVISOR_SEDE,
  supervisor: ROLES.SUPERVISOR_SEDE,
  supervisora: ROLES.SUPERVISOR_SEDE,
  'supervisor/a de sede': ROLES.SUPERVISOR_SEDE,
  encargadooficina: ROLES.ENCARGADO_OFICINA,
  'encargado oficina': ROLES.ENCARGADO_OFICINA,
  'encargado de oficina': ROLES.ENCARGADO_OFICINA,
  admin: ROLES.ENCARGADO_OFICINA
};

export const MANAGED_USER_ROLES: AppRole[] = [
  ROLES.ADMIN_EMPRESA,
  ROLES.GERENTE_EMPRESA,
  ROLES.SUPERVISOR_SEDE,
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
  return role === ROLES.SUPERVISOR_SEDE || role === ROLES.ENCARGADO_OFICINA;
}

export function getRoleLabel(role: AppRole): string {
  if (role === ROLES.SYSADMIN) return 'Administrador del Sistema';
  if (role === ROLES.ADMIN_EMPRESA) return 'Administrador General';
  if (role === ROLES.GERENTE_EMPRESA) return 'Gerente';
  if (role === ROLES.SUPERVISOR_SEDE) return 'Supervisor/a de Sede';
  return 'Encargado de Oficina';
}

export function getRoleUserType(role: AppRole): UserType {
  return role === ROLES.SYSADMIN ? USER_TYPES.SYSTEM : USER_TYPES.COMPANY;
}

export function getRoleScope(role: AppRole): AccessScope {
  if (role === ROLES.SYSADMIN) return ACCESS_SCOPES.SYSTEM;
  if (role === ROLES.ADMIN_EMPRESA || role === ROLES.GERENTE_EMPRESA) return ACCESS_SCOPES.COMPANY;
  return ACCESS_SCOPES.SITE;
}
