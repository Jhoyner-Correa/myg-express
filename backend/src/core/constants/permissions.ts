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

  TEMPLATES_VIEW: 'plantillas.ver',
  TEMPLATES_MANAGE: 'plantillas.gestionar',

  WHATSAPP_VIEW: 'whatsapp.ver',
  WHATSAPP_MANAGE: 'whatsapp.gestionar',

  URBANO_ROUTES_VIEW: 'urbano.rutas.ver',
  URBANO_ROUTES_MANAGE: 'urbano.rutas.gestionar',
  URBANO_DISPATCHES_VIEW: 'urbano.despachos.ver',

  PRINTING_VIEW: 'impresion.ver',
  PRINTING_MANAGE: 'impresion.gestionar',

  SAVAR_SCAN_VIEW: 'savarscan.ver',
  SAVAR_SCAN_MANAGE: 'savarscan.gestionar',
  RRHH_VIEW: 'rrhh.ver',
  RRHH_MANAGE: 'rrhh.gestionar',
  RRHH_ATTENDANCE_MANAGE: 'rrhh.asistencia.gestionar',
  RRHH_PAYMENTS_VIEW: 'rrhh.pagos.ver',
  RRHH_PAYMENTS_MANAGE: 'rrhh.pagos.gestionar',
  RRHH_CONFIGURE: 'rrhh.configurar',
  GPS_VIEW: 'gps.ver',
  GPS_MANAGE: 'gps.gestionar'
} as const;

export type AppPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as AppPermission[];

export const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  [ROLES.SYSADMIN]: ALL_PERMISSIONS,
  [ROLES.ADMIN_EMPRESA]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.RRHH_VIEW,
    PERMISSIONS.RRHH_MANAGE,
    PERMISSIONS.RRHH_ATTENDANCE_MANAGE,
    PERMISSIONS.RRHH_PAYMENTS_VIEW,
    PERMISSIONS.RRHH_PAYMENTS_MANAGE,
    PERMISSIONS.RRHH_CONFIGURE,
    PERMISSIONS.URBANO_DISPATCHES_VIEW,
    PERMISSIONS.PRINTING_VIEW,
    PERMISSIONS.PRINTING_MANAGE,
    PERMISSIONS.GPS_VIEW,
    PERMISSIONS.GPS_MANAGE,
    PERMISSIONS.ROUTES_VIEW,
    PERMISSIONS.ROUTES_MANAGE,
    PERMISSIONS.NOTICES_VIEW,
    PERMISSIONS.NOTICES_MANAGE,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.WHATSAPP_VIEW,
    PERMISSIONS.WHATSAPP_MANAGE,
    PERMISSIONS.URBANO_ROUTES_VIEW,
    PERMISSIONS.URBANO_ROUTES_MANAGE,
    PERMISSIONS.SAVAR_SCAN_VIEW,
    PERMISSIONS.SAVAR_SCAN_MANAGE
  ],
  [ROLES.GERENTE_EMPRESA]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.RRHH_VIEW,
    PERMISSIONS.RRHH_MANAGE,
    PERMISSIONS.RRHH_ATTENDANCE_MANAGE,
    PERMISSIONS.RRHH_PAYMENTS_VIEW,
    PERMISSIONS.GPS_VIEW,
    PERMISSIONS.GPS_MANAGE,
    PERMISSIONS.ROUTES_VIEW,
    PERMISSIONS.ROUTES_MANAGE,
    PERMISSIONS.NOTICES_VIEW,
    PERMISSIONS.NOTICES_MANAGE,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.WHATSAPP_VIEW,
    PERMISSIONS.WHATSAPP_MANAGE,
    PERMISSIONS.URBANO_ROUTES_VIEW,
    PERMISSIONS.URBANO_ROUTES_MANAGE,
    PERMISSIONS.PRINTING_VIEW,
    PERMISSIONS.PRINTING_MANAGE,
    PERMISSIONS.SAVAR_SCAN_VIEW,
    PERMISSIONS.SAVAR_SCAN_MANAGE
  ],
  [ROLES.SUPERVISOR_SEDE]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.RRHH_VIEW,
    PERMISSIONS.RRHH_ATTENDANCE_MANAGE,
    PERMISSIONS.GPS_VIEW,
    PERMISSIONS.ROUTES_VIEW,
    PERMISSIONS.ROUTES_MANAGE,
    PERMISSIONS.NOTICES_VIEW,
    PERMISSIONS.NOTICES_MANAGE,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.WHATSAPP_VIEW,
    PERMISSIONS.WHATSAPP_MANAGE,
    PERMISSIONS.URBANO_ROUTES_VIEW,
    PERMISSIONS.URBANO_ROUTES_MANAGE,
    PERMISSIONS.PRINTING_VIEW,
    PERMISSIONS.PRINTING_MANAGE,
    PERMISSIONS.SAVAR_SCAN_VIEW,
    PERMISSIONS.SAVAR_SCAN_MANAGE
  ],
  [ROLES.ENCARGADO_OFICINA]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ROUTES_VIEW,
    PERMISSIONS.ROUTES_MANAGE,
    PERMISSIONS.NOTICES_VIEW,
    PERMISSIONS.NOTICES_MANAGE,
    PERMISSIONS.TEMPLATES_VIEW,
    PERMISSIONS.TEMPLATES_MANAGE,
    PERMISSIONS.WHATSAPP_VIEW,
    PERMISSIONS.WHATSAPP_MANAGE,
    PERMISSIONS.URBANO_ROUTES_VIEW,
    PERMISSIONS.URBANO_ROUTES_MANAGE,
    PERMISSIONS.PRINTING_VIEW,
    PERMISSIONS.PRINTING_MANAGE,
    PERMISSIONS.SAVAR_SCAN_VIEW,
    PERMISSIONS.SAVAR_SCAN_MANAGE
  ]
};

export const VISIBILITY_PERMISSIONS = [
  'admin.panel.ver',
  'rutas.ver',
  'whatsapp.ver',
  'urbano.rutas.ver',
  'urbano.despachos.ver',
  'impresion.ver',
  'savarscan.ver',
  'rrhh.ver',
  'rrhh.pagos.ver',
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
  // Los permisos personalizados controlan visibilidad, pero nunca pueden
  // elevar un rol por encima del límite definido para ese rol.
  const allowedVisibility = customPermissions.filter((permission): permission is AppPermission =>
    VISIBILITY_PERMISSIONS.includes(permission)
    && roleDefault.includes(permission as AppPermission),
  );
  const roleActions = roleDefault.filter(p => !VISIBILITY_PERMISSIONS.includes(p));
  return [...new Set([...allowedVisibility, ...roleActions])];
}

export function hasPermission(role: AppRole, permission: AppPermission): boolean {
  return getPermissionsForRole(role).includes(permission);
}
