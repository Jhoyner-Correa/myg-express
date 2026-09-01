import bcrypt from 'bcrypt';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { PERMISSIONS, VISIBILITY_PERMISSIONS } from '../../../core/constants/permissions';
import { ACCESS_SCOPES, USER_TYPES } from '../../../core/constants/roles';
import { PasswordPolicyError, validateSystemPassword } from '../../../core/security/passwordPolicy';
import { normalizeVisibleModules, saveUserUiPreferences } from '../../../core/auth/userUiPreferences';

const MODULE_LABELS: Record<string, string> = {
  ADMIN: 'Administración',
  OPERACION: 'Panel operativo',
  RUTAS: 'Rutas',
  WHATSAPP: 'WhatsApp',
  ENTREGAS: 'Entregas',
  URBANO: 'Urbano',
  SAVAR_SCAN: 'SAVAR SCAN',
  ETIQUETAS: 'Etiquetas',
  RRHH: 'Recursos Humanos',
  GPS: 'Rastreo GPS',
};

type RoleRow = RowDataPacket & {
  id: number;
  codigo: string;
  nombre: string;
  tipo_usuario: 'SISTEMA' | 'EMPRESA';
  tipo_alcance: 'SISTEMA' | 'EMPRESA' | 'SEDE';
};

type UserRow = RowDataPacket & {
  id: number;
  nombre: string;
  usuario: string;
  foto: string | null;
  tipo_usuario: 'SISTEMA' | 'EMPRESA';
  estado: 'activo' | 'inactivo';
  ultimo_acceso_at: string | null;
  password_actualizado_at: string | null;
  created_at: string;
  rol: string;
  rol_label: string;
  alcance: 'SISTEMA' | 'EMPRESA' | 'SEDE';
  empresa_id: number | null;
  empresa_nombre: string | null;
  sede_id: number | null;
  sede_nombre: string | null;
  modulos: string | null;
};

export type SaveUserInput = {
  nombre: string;
  usuario: string;
  password?: string;
  roleCode: string;
  siteId?: number | null;
  estado?: 'activo' | 'inactivo';
  moduleCodes?: string[];
};

export type ChangePasswordInput = {
  newPassword: string;
  currentPassword?: string;
};

export type AuditContext = {
  actorId: number;
  ip?: string | null;
  userAgent?: string | null;
};

export class AccessValidationError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeUsername(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function modulesFromCsv(value: string | null): Array<{ code: string; name: string }> {
  if (!value) return [];
  return value
    .split(',')
    .filter(Boolean)
    .sort((a, b) => (MODULE_LABELS[a] ?? a).localeCompare(MODULE_LABELS[b] ?? b, 'es'))
    .map(code => ({ code, name: MODULE_LABELS[code] ?? code }));
}

function mapUser(row: UserRow) {
  const modules = modulesFromCsv(row.modulos);
  return {
    id: Number(row.id),
    name: row.nombre,
    username: row.usuario,
    foto: row.foto,
    userType: row.tipo_usuario,
    status: row.estado,
    lastAccessAt: row.ultimo_acceso_at,
    passwordUpdatedAt: row.password_actualizado_at,
    createdAt: row.created_at,
    role: { code: row.rol, name: row.rol_label },
    scope: {
      type: row.alcance,
      companyId: row.empresa_id ? Number(row.empresa_id) : null,
      companyName: row.empresa_nombre,
      siteId: row.sede_id ? Number(row.sede_id) : null,
      siteName: row.sede_nombre,
      label: row.alcance === ACCESS_SCOPES.SYSTEM
        ? 'Sistema'
        : row.alcance === ACCESS_SCOPES.COMPANY
          ? row.empresa_nombre ?? 'Corporativo'
          : row.sede_nombre ?? 'Sede sin asignar',
    },
    access: { moduleCount: modules.length, modules },
    security: {
      passwordConfigured: true,
      passwordUpdatedAt: row.password_actualizado_at,
    },
    protected: row.tipo_usuario === USER_TYPES.SYSTEM,
  };
}

async function findCompany(connection: PoolConnection): Promise<number> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT id FROM empresas WHERE codigo = 'MYG_EXPRESS' AND estado = 'ACTIVA' LIMIT 1 FOR UPDATE`,
  );
  if (!rows.length) throw new AccessValidationError('La empresa MyG Express no está configurada.', 409);
  return Number(rows[0].id);
}

async function findManagedRole(connection: PoolConnection, roleCode: string): Promise<RoleRow> {
  const [rows] = await connection.query<RoleRow[]>(
    `SELECT id, codigo, nombre, tipo_usuario, tipo_alcance
       FROM roles
      WHERE codigo = ? AND tipo_usuario = 'EMPRESA' AND estado = 'ACTIVO'
      LIMIT 1`,
    [roleCode],
  );
  if (!rows.length) throw new AccessValidationError('El rol empresarial seleccionado no existe.');
  return rows[0];
}

async function validateSite(
  connection: PoolConnection,
  siteId: number | null,
  companyId: number,
  required: boolean,
): Promise<number | null> {
  if (!required) return null;
  if (!siteId || !Number.isInteger(siteId) || siteId <= 0) {
    throw new AccessValidationError('La sede es obligatoria para este rol.');
  }
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM sedes WHERE id = ? AND empresa_id = ? AND estado = \'activo\' LIMIT 1',
    [siteId, companyId],
  );
  if (!rows.length) throw new AccessValidationError('La sede seleccionada no existe o está inactiva.');
  return siteId;
}

function validateInput(input: SaveUserInput, isCreate: boolean): SaveUserInput {
  const normalized = {
    ...input,
    nombre: normalizeText(input.nombre),
    usuario: normalizeUsername(input.usuario),
    password: input.password === undefined ? undefined : String(input.password),
    roleCode: normalizeText(input.roleCode),
    estado: input.estado === 'inactivo' ? 'inactivo' as const : 'activo' as const,
    moduleCodes: Array.isArray(input.moduleCodes)
      ? [...new Set(input.moduleCodes.map(normalizeText).filter(Boolean))]
      : undefined,
  };
  if (!normalized.nombre || !normalized.usuario || !normalized.roleCode) {
    throw new AccessValidationError('Nombre, usuario y rol son obligatorios.');
  }
  if (!/^[a-z0-9._-]{3,60}$/.test(normalized.usuario)) {
    throw new AccessValidationError('El usuario debe tener entre 3 y 60 caracteres válidos.');
  }
  if (isCreate && !normalized.password) {
    throw new AccessValidationError('La contraseña es obligatoria al crear la cuenta.');
  }
  if (normalized.password) normalized.password = validatePassword(normalized.password);
  return normalized;
}

function validatePassword(value: unknown): string {
  try {
    return validateSystemPassword(value);
  } catch (error) {
    if (error instanceof PasswordPolicyError) {
      throw new AccessValidationError(error.message);
    }
    throw error;
  }
}

async function syncModuleAccess(
  connection: PoolConnection,
  userId: number,
  roleId: number,
  requestedCodes: string[] | undefined,
): Promise<void> {
  if (requestedCodes === undefined) return;

  const [allowedRows] = await connection.query<RowDataPacket[]>(
    `SELECT permission.id, permission.codigo
       FROM rol_permisos role_permission
       INNER JOIN permisos permission
         ON permission.id = role_permission.permiso_id
        AND permission.estado = 'ACTIVO'
      WHERE role_permission.rol_id = ?
        AND permission.codigo IN (?)`,
    [roleId, VISIBILITY_PERMISSIONS],
  );
  const allowed = new Map(allowedRows.map(row => [String(row.codigo), Number(row.id)]));
  const invalid = requestedCodes.filter(code => !allowed.has(code));
  if (invalid.length) {
    throw new AccessValidationError('Uno o más accesos seleccionados no pertenecen al rol asignado.');
  }

  await connection.query(
    `DELETE user_permission
       FROM usuario_permisos user_permission
       INNER JOIN permisos permission ON permission.id = user_permission.permiso_id
      WHERE user_permission.usuario_id = ?
        AND permission.codigo IN (?)`,
    [userId, VISIBILITY_PERMISSIONS],
  );

  const selected = new Set(requestedCodes);
  for (const [code, permissionId] of allowed.entries()) {
    if (selected.has(code)) continue;
    await connection.query(
      `INSERT INTO usuario_permisos
         (usuario_id, permiso_id, efecto, motivo)
       VALUES (?, ?, 'DENEGAR', 'Configuración administrativa de accesos')`,
      [userId, permissionId],
    );
  }
}

async function audit(
  connection: PoolConnection,
  context: AuditContext,
  event: string,
  entityId: number,
  companyId: number | null,
  siteId: number | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  await connection.query(
    `INSERT INTO auditoria_sistema
       (actor_usuario_id, evento, entidad_tipo, entidad_id, empresa_id, sede_id, ip, user_agent, metadata)
     VALUES (?, ?, 'USUARIO', ?, ?, ?, ?, ?, ?)`,
    [
      context.actorId,
      event,
      String(entityId),
      companyId,
      siteId,
      context.ip ?? null,
      context.userAgent?.slice(0, 255) ?? null,
      JSON.stringify(metadata),
    ],
  );
}

export class UserAccessAdminService {
  async listUsers() {
    const [rows] = await pool.query<UserRow[]>(
      `SELECT
         user.id,
         user.nombre,
         user.usuario,
         user.foto,
         user.tipo_usuario,
         user.estado,
         user.ultimo_acceso_at,
         user.password_actualizado_at,
         user.created_at,
         access_role.codigo AS rol,
         access_role.nombre AS rol_label,
         assignment.alcance,
         assignment.empresa_id,
         company.nombre_comercial AS empresa_nombre,
         assignment.sede_id,
         site.nombre AS sede_nombre,
         GROUP_CONCAT(DISTINCT CASE
           WHEN user_permission.efecto = 'DENEGAR' THEN NULL
           WHEN permission.codigo NOT IN (
             'admin.panel.ver', 'rutas.ver', 'whatsapp.ver', 'urbano.rutas.ver',
             'entregas.ver', 'etiquetas.ver', 'savarscan.ver', 'rrhh.ver', 'gps.ver'
           ) THEN NULL
           ELSE permission.modulo
         END ORDER BY permission.modulo SEPARATOR ',') AS modulos
       FROM usuarios user
       INNER JOIN usuario_asignaciones assignment
         ON assignment.usuario_id = user.id
        AND assignment.es_principal = 1
        AND assignment.estado = 'ACTIVA'
       INNER JOIN roles access_role ON access_role.id = assignment.rol_id
       LEFT JOIN empresas company ON company.id = assignment.empresa_id
       LEFT JOIN sedes site ON site.id = assignment.sede_id
       LEFT JOIN rol_permisos role_permission ON role_permission.rol_id = access_role.id
       LEFT JOIN permisos permission
         ON permission.id = role_permission.permiso_id AND permission.estado = 'ACTIVO'
       LEFT JOIN usuario_permisos user_permission
         ON user_permission.usuario_id = user.id
        AND user_permission.permiso_id = permission.id
        AND (user_permission.vigente_hasta IS NULL OR user_permission.vigente_hasta >= NOW())
       GROUP BY
         user.id, user.nombre, user.usuario, user.foto, user.tipo_usuario, user.estado,
         user.ultimo_acceso_at, user.password_actualizado_at, user.created_at,
         access_role.codigo, access_role.nombre, assignment.alcance,
         assignment.empresa_id, company.nombre_comercial, assignment.sede_id, site.nombre
       ORDER BY user.tipo_usuario DESC, user.nombre ASC`,
    );
    return rows.map(mapUser);
  }

  async getCatalog() {
    const [roles] = await pool.query<RowDataPacket[]>(
      `SELECT role.id, role.codigo, role.nombre, role.tipo_usuario, role.tipo_alcance,
              role.descripcion, COUNT(role_permission.permiso_id) AS permission_count
         FROM roles role
         LEFT JOIN rol_permisos role_permission ON role_permission.rol_id = role.id
        WHERE role.estado = 'ACTIVO'
        GROUP BY role.id
        ORDER BY role.tipo_usuario DESC, role.id ASC`,
    );
    const [companyRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, nombre_comercial AS nombre
         FROM empresas WHERE codigo = 'MYG_EXPRESS' LIMIT 1`,
    );
    const [moduleRows] = await pool.query<RowDataPacket[]>(
      `SELECT role_permission.rol_id, permission.codigo, permission.modulo
         FROM rol_permisos role_permission
         INNER JOIN permisos permission
           ON permission.id = role_permission.permiso_id
          AND permission.estado = 'ACTIVO'
        WHERE permission.codigo IN (?)
        ORDER BY permission.modulo ASC`,
      [VISIBILITY_PERMISSIONS],
    );
    return {
      company: companyRows[0] ?? null,
      roles: roles.map(role => ({
        id: Number(role.id),
        code: role.codigo,
        name: role.nombre,
        userType: role.tipo_usuario,
        scopeType: role.tipo_alcance,
        description: role.descripcion,
        permissionCount: Number(role.permission_count),
        managed: role.tipo_usuario === USER_TYPES.COMPANY,
        modules: moduleRows
          .filter(module => Number(module.rol_id) === Number(role.id))
          .map(module => ({
            code: String(module.codigo),
            name: MODULE_LABELS[String(module.modulo)] ?? String(module.modulo),
          })),
      })),
    };
  }

  async getUserDetail(userId: number) {
    const users = await this.listUsers();
    const user = users.find(item => item.id === userId);
    if (!user) throw new AccessValidationError('Usuario no encontrado.', 404);
    const [activity] = await pool.query<RowDataPacket[]>(
      `SELECT evento, ip, created_at
         FROM auditoria_sistema
        WHERE entidad_tipo = 'USUARIO' AND entidad_id = ?
        ORDER BY created_at DESC
        LIMIT 12`,
      [String(userId)],
    );
    return {
      ...user,
      recentActivity: activity.map(item => ({
        event: item.evento,
        ip: item.ip,
        createdAt: item.created_at,
      })),
    };
  }

  async updateOwnModuleAccess(
    rawModuleCodes: unknown,
    context: AuditContext,
  ): Promise<string[]> {
    const moduleCodes = normalizeVisibleModules(rawModuleCodes);

    if (!moduleCodes.includes(PERMISSIONS.ADMIN_PANEL_VIEW)) {
      throw new AccessValidationError(
        'El Panel central debe permanecer habilitado para administrar tus accesos.',
      );
    }

    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT user.tipo_usuario, assignment.rol_id, assignment.empresa_id, assignment.sede_id
           FROM usuarios user
           INNER JOIN usuario_asignaciones assignment
             ON assignment.usuario_id = user.id
            AND assignment.es_principal = 1
            AND assignment.estado = 'ACTIVA'
            AND assignment.vigente_desde <= NOW()
            AND (assignment.vigente_hasta IS NULL OR assignment.vigente_hasta >= NOW())
          WHERE user.id = ?
          LIMIT 1 FOR UPDATE`,
        [context.actorId],
      );
      if (!rows.length) throw new AccessValidationError('Usuario sin acceso principal activo.', 404);
      if (rows[0].tipo_usuario !== USER_TYPES.SYSTEM) {
        throw new AccessValidationError(
          'Esta configuración personal está disponible únicamente para la cuenta principal.',
          403,
        );
      }

      const [allowedRows] = await connection.query<RowDataPacket[]>(
        `SELECT permission.codigo
           FROM rol_permisos role_permission
           INNER JOIN permisos permission
             ON permission.id = role_permission.permiso_id
            AND permission.estado = 'ACTIVO'
          WHERE role_permission.rol_id = ?
            AND permission.codigo IN (?)`,
        [Number(rows[0].rol_id), VISIBILITY_PERMISSIONS],
      );
      const allowedCodes = new Set(allowedRows.map(row => String(row.codigo)));
      if (moduleCodes.some(code => !allowedCodes.has(code))) {
        throw new AccessValidationError('Uno o más módulos no pertenece a tu rol actual.');
      }

      await saveUserUiPreferences(connection, context.actorId, moduleCodes);

      // La visibilidad del menú es una preferencia, nunca una revocación de permisos.
      await connection.query(
        `DELETE user_permission
           FROM usuario_permisos user_permission
           INNER JOIN permisos permission ON permission.id = user_permission.permiso_id
          WHERE user_permission.usuario_id = ?
            AND permission.codigo IN (?)`,
        [context.actorId, VISIBILITY_PERMISSIONS],
      );
      await audit(
        connection,
        context,
        'USUARIO_MODULOS_ACTUALIZADOS',
        context.actorId,
        rows[0].empresa_id ? Number(rows[0].empresa_id) : null,
        rows[0].sede_id ? Number(rows[0].sede_id) : null,
        { modules: moduleCodes, mode: 'UI_PREFERENCE' },
      );
    });
    return moduleCodes;
  }

  async createUser(rawInput: SaveUserInput, context: AuditContext): Promise<number> {
    const input = validateInput(rawInput, true);
    return runInTransaction(async connection => {
      const companyId = await findCompany(connection);
      const role = await findManagedRole(connection, input.roleCode);
      const siteId = await validateSite(
        connection,
        input.siteId ?? null,
        companyId,
        role.tipo_alcance === ACCESS_SCOPES.SITE,
      );
      const passwordHash = await bcrypt.hash(input.password!, 12);
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO usuarios
           (nombre, usuario, password_hash, tipo_usuario, estado, password_actualizado_at)
         VALUES (?, ?, ?, 'EMPRESA', ?, NOW())`,
        [input.nombre, input.usuario, passwordHash, input.estado],
      );
      await connection.query(
        `INSERT INTO usuario_asignaciones
           (usuario_id, rol_id, empresa_id, sede_id, alcance, es_principal)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [result.insertId, role.id, companyId, siteId, role.tipo_alcance],
      );
      await syncModuleAccess(connection, result.insertId, role.id, input.moduleCodes);
      await audit(connection, context, 'USUARIO_CREADO', result.insertId, companyId, siteId, {
        role: role.codigo,
        status: input.estado,
        modules: input.moduleCodes ?? 'ROLE_DEFAULT',
      });
      return result.insertId;
    });
  }

  async updateUser(userId: number, rawInput: SaveUserInput, context: AuditContext): Promise<void> {
    const input = validateInput(rawInput, false);
    await runInTransaction(async connection => {
      const [targetRows] = await connection.query<RowDataPacket[]>(
        `SELECT user.id, user.tipo_usuario, current_role.codigo AS role_code
           FROM usuarios user
           LEFT JOIN usuario_asignaciones current_assignment
             ON current_assignment.usuario_id = user.id
            AND current_assignment.es_principal = 1
            AND current_assignment.estado = 'ACTIVA'
           LEFT JOIN roles current_role ON current_role.id = current_assignment.rol_id
          WHERE user.id = ? LIMIT 1 FOR UPDATE`,
        [userId],
      );
      if (!targetRows.length) throw new AccessValidationError('Usuario no encontrado.', 404);
      if (targetRows[0].tipo_usuario === USER_TYPES.SYSTEM) {
        throw new AccessValidationError('Las cuentas técnicas del sistema no se modifican desde este formulario.', 403);
      }
      const companyId = await findCompany(connection);
      const role = await findManagedRole(connection, input.roleCode);
      const siteId = await validateSite(
        connection,
        input.siteId ?? null,
        companyId,
        role.tipo_alcance === ACCESS_SCOPES.SITE,
      );

      const fields = ['nombre = ?', 'usuario = ?', "tipo_usuario = 'EMPRESA'", 'estado = ?'];
      const params: Array<string | number | null> = [
        input.nombre, input.usuario, input.estado ?? 'activo',
      ];
      if (input.password) {
        fields.push('password_hash = ?', 'password_actualizado_at = NOW()');
        params.push(await bcrypt.hash(input.password, 12));
      }
      params.push(userId);
      await connection.query(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`, params);

      await connection.query(
        `UPDATE usuario_asignaciones
            SET estado = 'INACTIVA', vigente_hasta = COALESCE(vigente_hasta, NOW())
          WHERE usuario_id = ? AND estado = 'ACTIVA'`,
        [userId],
      );
      await connection.query(
        `INSERT INTO usuario_asignaciones
           (usuario_id, rol_id, empresa_id, sede_id, alcance, es_principal)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [userId, role.id, companyId, siteId, role.tipo_alcance],
      );
      if (targetRows[0].role_code !== role.codigo) {
        await connection.query('DELETE FROM usuario_permisos WHERE usuario_id = ?', [userId]);
      }
      await syncModuleAccess(connection, userId, role.id, input.moduleCodes);
      await audit(connection, context, 'USUARIO_ACTUALIZADO', userId, companyId, siteId, {
        role: role.codigo,
        status: input.estado,
        passwordChanged: Boolean(input.password),
        modules: input.moduleCodes ?? 'UNCHANGED',
      });
    });
  }

  async changePassword(
    userId: number,
    rawInput: ChangePasswordInput,
    context: AuditContext,
  ): Promise<void> {
    const newPassword = validatePassword(rawInput.newPassword);
    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT user.id, user.password_hash, user.tipo_usuario,
                assignment.empresa_id, assignment.sede_id
           FROM usuarios user
           LEFT JOIN usuario_asignaciones assignment
             ON assignment.usuario_id = user.id
            AND assignment.es_principal = 1
            AND assignment.estado = 'ACTIVA'
          WHERE user.id = ? LIMIT 1 FOR UPDATE`,
        [userId],
      );
      if (!rows.length) throw new AccessValidationError('Usuario no encontrado.', 404);
      const target = rows[0];
      const selfChange = userId === context.actorId;
      if (target.tipo_usuario === USER_TYPES.SYSTEM && !selfChange) {
        throw new AccessValidationError('La cuenta principal solo puede cambiar su propia contraseña.', 403);
      }
      const currentPassword = normalizeText(rawInput.currentPassword);
      const [actorRows] = await connection.query<RowDataPacket[]>(
        'SELECT password_hash FROM usuarios WHERE id = ? LIMIT 1',
        [context.actorId],
      );
      if (!actorRows.length || !currentPassword
        || !await bcrypt.compare(currentPassword, String(actorRows[0].password_hash))) {
        throw new AccessValidationError('Tu contraseña de administrador no es correcta.');
      }
      if (await bcrypt.compare(newPassword, String(target.password_hash))) {
        throw new AccessValidationError('La nueva contraseña debe ser diferente a la actual.');
      }

      await connection.query(
        'UPDATE usuarios SET password_hash = ?, password_actualizado_at = NOW() WHERE id = ?',
        [await bcrypt.hash(newPassword, 12), userId],
      );
      await audit(
        connection,
        context,
        'USUARIO_PASSWORD_ACTUALIZADO',
        userId,
        target.empresa_id ? Number(target.empresa_id) : null,
        target.sede_id ? Number(target.sede_id) : null,
        { mode: selfChange ? 'SELF_CHANGE' : 'ADMIN_RESET' },
      );
    });
  }

  async suspendUser(userId: number, context: AuditContext): Promise<void> {
    if (userId === context.actorId) {
      throw new AccessValidationError('No puedes suspender tu propia cuenta.', 400);
    }
    await runInTransaction(async connection => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT user.tipo_usuario, assignment.empresa_id, assignment.sede_id
           FROM usuarios user
           LEFT JOIN usuario_asignaciones assignment
             ON assignment.usuario_id = user.id AND assignment.es_principal = 1 AND assignment.estado = 'ACTIVA'
          WHERE user.id = ? LIMIT 1 FOR UPDATE`,
        [userId],
      );
      if (!rows.length) throw new AccessValidationError('Usuario no encontrado.', 404);
      if (rows[0].tipo_usuario === USER_TYPES.SYSTEM) {
        throw new AccessValidationError('No se puede suspender una cuenta técnica del sistema.', 403);
      }
      await connection.query("UPDATE usuarios SET estado = 'inactivo' WHERE id = ?", [userId]);
      await audit(
        connection,
        context,
        'USUARIO_SUSPENDIDO',
        userId,
        rows[0].empresa_id ? Number(rows[0].empresa_id) : null,
        rows[0].sede_id ? Number(rows[0].sede_id) : null,
        {},
      );
    });
  }
}
