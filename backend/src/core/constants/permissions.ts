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
  URBANO_ROUTES_MANAGE: 'urbano.rutas.gestionar',

  SAVAR_SCAN_VIEW: 'savarscan.ver',
  SAVAR_SCAN_MANAGE: 'savarscan.gestionar',
  LABELS_GENERATE: 'etiquetas.ver',
  RRHH_VIEW: 'rrhh.ver',
  RRHH_MANAGE: 'rrhh.gestionar',
  GPS_VIEW: 'gps.ver',
  GPS_MANAGE: 'gps.gestionar'
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
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.RRHH_VIEW,
    PERMISSIONS.RRHH_MANAGE,
    PERMISSIONS.GPS_VIEW,
    PERMISSIONS.GPS_MANAGE,
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
    PERMISSIONS.URBANO_ROUTES_MANAGE,
    PERMISSIONS.SAVAR_SCAN_VIEW,
    PERMISSIONS.SAVAR_SCAN_MANAGE,
    PERMISSIONS.LABELS_GENERATE
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
    PERMISSIONS.URBANO_ROUTES_MANAGE,
    PERMISSIONS.SAVAR_SCAN_VIEW,
    PERMISSIONS.SAVAR_SCAN_MANAGE,
    PERMISSIONS.LABELS_GENERATE,
    PERMISSIONS.GPS_VIEW,
    PERMISSIONS.GPS_MANAGE
  ]
};

export const VISIBILITY_PERMISSIONS = [
  'admin.panel.ver',
  'rutas.ver',
  'whatsapp.ver',
  'urbano.rutas.ver',
  'entregas.ver',
  'etiquetas.ver',
  'savarscan.ver',
  'rrhh.ver',
  'gps.ver'
];

export function getPermissionsForRole(role: AppRole): AppPermission[] {
  return [...(ROLE_PERMISSIONS[role] || [])];
}

export function getFinalPermissions(role: AppRole, customPermissions?: string[] | null): AppPermission[] {
  const roleDefault = ROLE_PERMISSIONS[role] || [];
  if (!customPermissions || customPermissions.length === 0) {
    return [...roleDefault];
  }
  const roleActions = roleDefault.filter(p => !VISIBILITY_PERMISSIONS.includes(p));
  return [...(customPermissions as AppPermission[]), ...roleActions];
}

export function hasPermission(role: AppRole, permission: AppPermission): boolean {
  return getPermissionsForRole(role).includes(permission);
}
