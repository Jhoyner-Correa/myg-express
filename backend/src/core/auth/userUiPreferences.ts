import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../database/database';
import { AppPermission, VISIBILITY_PERMISSIONS } from '../constants/permissions';

type PreferenceRow = RowDataPacket & { modulos_sidebar: string | null };

const visibilitySet = new Set<string>(VISIBILITY_PERMISSIONS);

export type UserUiPreferences = {
  visibleModules: AppPermission[] | null;
};

export function normalizeVisibleModules(value: unknown): AppPermission[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map(item => String(item ?? '').trim())
      .filter((item): item is AppPermission => visibilitySet.has(item)),
  )];
}

export async function loadUserUiPreferences(userId: number): Promise<UserUiPreferences> {
  const [rows] = await pool.query<PreferenceRow[]>(
    'SELECT modulos_sidebar FROM usuario_preferencias_ui WHERE usuario_id = ? LIMIT 1',
    [userId],
  );
  if (!rows.length || rows[0].modulos_sidebar === null) return { visibleModules: null };

  try {
    const raw = typeof rows[0].modulos_sidebar === 'string'
      ? JSON.parse(rows[0].modulos_sidebar)
      : rows[0].modulos_sidebar;
    return { visibleModules: normalizeVisibleModules(raw) };
  } catch {
    return { visibleModules: null };
  }
}

export async function saveUserUiPreferences(
  connection: PoolConnection,
  userId: number,
  visibleModules: readonly AppPermission[],
): Promise<void> {
  await connection.query(
    `INSERT INTO usuario_preferencias_ui (usuario_id, modulos_sidebar)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE modulos_sidebar = VALUES(modulos_sidebar)`,
    [userId, JSON.stringify(visibleModules)],
  );
}
