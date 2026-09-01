import { useCallback } from 'react';
import { useAuth } from './authState';

export const PERMISSIONS = {
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
  RRHH_VIEW: 'rrhh.ver',
  RRHH_MANAGE: 'rrhh.gestionar',
  RRHH_ATTENDANCE_MANAGE: 'rrhh.asistencia.gestionar',
  RRHH_PAYMENTS_VIEW: 'rrhh.pagos.ver',
  RRHH_PAYMENTS_MANAGE: 'rrhh.pagos.gestionar',
  RRHH_CONFIGURE: 'rrhh.configurar',
} as const;

export type AppPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | string;

export function userHasPermission(
  user: { permisos?: string[] } | null | undefined,
  permission: AppPermission,
) {
  return Boolean(user?.permisos?.includes(permission));
}

export function usePermissions() {
  const { user } = useAuth();
  const can = useCallback(
    (permission: AppPermission) => userHasPermission(user, permission),
    [user],
  );
  const canAny = useCallback(
    (...permissions: AppPermission[]) => permissions.some(permission => can(permission)),
    [can],
  );

  return { can, canAny };
}
