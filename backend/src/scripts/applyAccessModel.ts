import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';
import { executeMigrationStatement } from './migrationSql';

const MIGRATION_ID = '012_access_model';
const LOCK_NAME = 'myg_access_model';

type CountRow = RowDataPacket & { total: number };
type LockRow = RowDataPacket & { acquired: number };

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const [[row]] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) total
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, columnName],
  );
  return Number(row.total) > 0;
}

function migrationStatements(): string[] {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations', '012_access_model.sql'),
    'utf8',
  );

  return source
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

async function assertPreflight(): Promise<void> {
  const checks: Array<[string, string]> = [
    ['usuarios sin identidad válida', `SELECT COUNT(*) total FROM usuarios
      WHERE nombre IS NULL OR TRIM(nombre) = '' OR usuario IS NULL OR TRIM(usuario) = ''
        OR password_hash IS NULL OR TRIM(password_hash) = ''`],
    ['usuarios con sede huérfana', `SELECT COUNT(*) total FROM usuarios usuario
      LEFT JOIN sedes sede ON sede.id = usuario.sede_id
      WHERE usuario.sede_id IS NOT NULL AND sede.id IS NULL`],
    ['encargados sin sede', `SELECT COUNT(*) total FROM usuarios
      WHERE rol = 'EncargadoOficina' AND sede_id IS NULL`],
    ['roles no reconocidos', `SELECT COUNT(*) total FROM usuarios
      WHERE rol NOT IN ('SysAdmin', 'AdminEmpresa', 'EncargadoOficina')`],
    ['cuentas SysAdmin inconsistentes', `SELECT COUNT(*) total FROM usuarios
      WHERE (rol = 'SysAdmin' AND es_superadmin <> 1)
         OR (rol <> 'SysAdmin' AND es_superadmin = 1)`],
  ];

  if (await columnExists('usuarios', 'permisos')) {
    checks.push(['permisos JSON inválidos', `SELECT COUNT(*) total FROM usuarios
      WHERE permisos IS NOT NULL AND (JSON_VALID(permisos) = 0 OR JSON_TYPE(permisos) <> 'ARRAY')`]);
  }

  for (const [label, sql] of checks) {
    const [[row]] = await pool.query<CountRow[]>(sql);
    if (Number(row.total) !== 0) {
      throw new Error(`Preflight detenido: existen ${row.total} ${label}.`);
    }
  }
}

async function constraintExists(name: string): Promise<boolean> {
  const [[row]] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) total
       FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`,
    [name],
  );
  return Number(row.total) > 0;
}

async function main(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) {
    throw new Error('No se pudo adquirir el candado de migración del modelo de acceso.');
  }

  try {
    const [applied] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM schema_migrations WHERE id = ?',
      [MIGRATION_ID],
    );
    if (applied.length) {
      console.log('Migración 012 del modelo de acceso ya estaba aplicada.');
      return;
    }

    await assertPreflight();
    const hasLegacyPermissions = await columnExists('usuarios', 'permisos');
    for (const statement of migrationStatements()) {
      if (!hasLegacyPermissions && /\busuario\.permisos\b/i.test(statement)) {
        console.log('Sin permisos JSON heredados: no se requiere migrar excepciones por usuario.');
        continue;
      }
      const constraintName = /ADD\s+CONSTRAINT\s+([a-zA-Z0-9_]+)/i.exec(statement)?.[1];
      if (constraintName && await constraintExists(constraintName)) continue;
      await executeMigrationStatement(pool, statement);
    }

    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migración 012 del modelo de acceso completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
