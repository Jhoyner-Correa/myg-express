import { AppRole, ROLES } from './roles';

export const PERMISSIONS = {
  ADMIN_PANEL_VIEW: 'admin.panel.ver',
  SEDES_MANAGE: 'sedes.gestionar',
  USERS_MANAGE: 'usuarios.gestionar',
  QUEUES_VIEW: 'colas.ver',

  DASHBOARD_VIEW: 'dashboard.ver',

  ROUTES_VIEW: 'rutas.ver',
  ROUTES_MANAGE: 'rutas.gestionar',

  NOTICES_VIEW: 'avisos.ver',
  NOTICES_MANAGE: 'avisos.gestionar',

  DELIVERIES_VIEW: 'entregas.ver',
  DELIVERIES_MANAGE: 'entregas.gestionar',

  TEMPLATES_VIEW: 'plantillas.ver',
  TEMPLATES_MANAGE: 'plantillas.gestionar',

  WHATSAPP_VIEW: 'whatsapp.ver',
  WHATSAPP_MANAGE: 'whatsapp.gestionar',

  URBANO_ROUTES_VIEW: 'urbano.rutas.ver',
  URBANO_ROUTES_MANAGE: 'urbano.rutas.gestionar'
} as const;

export type AppPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  [ROLES.SYSADMIN]: [
    PERMISSIONS.ADMIN_PANEL_VIEW,
    PERMISSIONS.SEDES_MANAGE,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.QUEUES_VIEW
  ],
  [ROLES.ADMIN_EMPRESA]: [
    PERMISSIONS.DASHBOARD_VIEW
  ],
  [ROLES.ENCARGADO_OFICINA]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ROUTES_VIEW,
    PERMISSIONS.ROUTES_MANAGE,
    PERMISSIONS.NOTICES_VIEW,
    PERMISSIONS.NOTICES_MANAGE,
    PERMISSIONS.DELIVERIES_VIEW,
    PERMISSIONS.DELIVERIES_MANAGE,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.WHATSAPP_VIEW,
    PERMISSIONS.WHATSAPP_MANAGE,
    PERMISSIONS.URBANO_ROUTES_VIEW,
    PERMISSIONS.URBANO_ROUTES_MANAGE
  ]
};

export function getPermissionsForRole(role: AppRole): AppPermission[] {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

export function hasPermission(role: AppRole, permission: AppPermission): boolean {
  return getPermissionsForRole(role).includes(permission);
}
