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
} as const;

export type AppPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | string;

export function userHasPermission(
  user: { es_superadmin?: boolean; permisos?: string[] } | null | undefined,
  permission: AppPermission,
) {
  return Boolean(user?.es_superadmin || user?.permisos?.includes(permission));
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
