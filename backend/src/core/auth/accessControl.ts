import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../database/database';
import { AppPermission } from '../constants/permissions';
import {
  ACCESS_SCOPES,
  AccessScope,
  AppRole,
  getRoleLabel,
  normalizeRole,
  USER_TYPES,
  UserType,
} from '../constants/roles';

type AssignmentRow = RowDataPacket & {
  role_code: string;
  role_label: string;
  tipo_usuario: UserType;
  alcance: AccessScope;
  empresa_id: number | null;
  sede_id: number | null;
  sede_nombre: string | null;
  es_principal: number;
};

type PermissionRow = RowDataPacket & { codigo: AppPermission };
type OverrideRow = RowDataPacket & { codigo: AppPermission; efecto: 'PERMITIR' | 'DENEGAR' };

export type AccessContext = {
  type: UserType;
  role: AppRole;
  roleLabel: string;
  scope: AccessScope;
  companyId: number | null;
  siteId: number | null;
  siteName: string | null;
  siteIds: number[];
  permissions: AppPermission[];
  source: 'NORMALIZED';
};

export function applyPermissionOverrides(
  rolePermissions: readonly AppPermission[],
  overrides: ReadonlyArray<{ codigo: AppPermission; efecto: 'PERMITIR' | 'DENEGAR' }>,
): AppPermission[] {
  const roleCeiling = new Set(rolePermissions);
  const effective = new Set(rolePermissions);

  for (const override of overrides) {
    if (override.efecto === 'DENEGAR') {
      effective.delete(override.codigo);
    } else if (roleCeiling.has(override.codigo)) {
      // Una excepción nunca eleva al usuario por encima de los permisos de su rol.
      effective.add(override.codigo);
    }
  }

  return [...effective];
}

export async function loadAccessContext(userId: number): Promise<AccessContext> {
    const [assignments] = await pool.query<AssignmentRow[]>(
      `SELECT
         role.codigo AS role_code,
         role.nombre AS role_label,
         role.tipo_usuario,
         assignment.alcance,
         assignment.empresa_id,
         assignment.sede_id,
         site.nombre AS sede_nombre,
         assignment.es_principal
       FROM usuario_asignaciones assignment
       INNER JOIN roles role ON role.id = assignment.rol_id AND role.estado = 'ACTIVO'
       LEFT JOIN sedes site ON site.id = assignment.sede_id
       WHERE assignment.usuario_id = ?
         AND assignment.estado = 'ACTIVA'
         AND assignment.vigente_desde <= NOW()
         AND (assignment.vigente_hasta IS NULL OR assignment.vigente_hasta >= NOW())
       ORDER BY assignment.es_principal DESC, assignment.id ASC`,
      [userId],
    );

    if (!assignments.length) throw new Error('Usuario sin asignaciÃ³n de acceso activa');

    const primary = assignments[0];
    const role = normalizeRole(primary.role_code, primary.tipo_usuario === USER_TYPES.SYSTEM);
    const siteIds = [...new Set(
      assignments
        .filter(assignment => assignment.alcance === ACCESS_SCOPES.SITE && assignment.sede_id)
        .map(assignment => Number(assignment.sede_id)),
    )];

    const [rolePermissions] = await pool.query<PermissionRow[]>(
      `SELECT DISTINCT permission.codigo
       FROM usuario_asignaciones assignment
       INNER JOIN rol_permisos role_permission ON role_permission.rol_id = assignment.rol_id
       INNER JOIN permisos permission ON permission.id = role_permission.permiso_id
       WHERE assignment.usuario_id = ?
         AND assignment.estado = 'ACTIVA'
         AND assignment.vigente_desde <= NOW()
         AND (assignment.vigente_hasta IS NULL OR assignment.vigente_hasta >= NOW())
         AND permission.estado = 'ACTIVO'`,
      [userId],
    );
    const [overrides] = await pool.query<OverrideRow[]>(
      `SELECT permission.codigo, user_permission.efecto
       FROM usuario_permisos user_permission
       INNER JOIN permisos permission ON permission.id = user_permission.permiso_id
       WHERE user_permission.usuario_id = ?
         AND (user_permission.vigente_hasta IS NULL OR user_permission.vigente_hasta >= NOW())`,
      [userId],
    );

    return {
      type: primary.tipo_usuario,
      role,
      roleLabel: primary.role_label || getRoleLabel(role),
      scope: primary.alcance,
      companyId: primary.empresa_id ? Number(primary.empresa_id) : null,
      siteId: primary.alcance === ACCESS_SCOPES.SITE && primary.sede_id
        ? Number(primary.sede_id)
        : null,
      siteName: primary.sede_nombre ?? null,
      siteIds,
      permissions: applyPermissionOverrides(
        rolePermissions.map(row => row.codigo),
        overrides,
      ),
      source: 'NORMALIZED',
    };
}
