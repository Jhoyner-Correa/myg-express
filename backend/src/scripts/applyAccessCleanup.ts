import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const MIGRATION_ID = '014_access_cleanup';
const LOCK_NAME = 'myg_access_cleanup';

type CountRow = RowDataPacket & { total: number };
type LockRow = RowDataPacket & { acquired: number };
type ForeignKeyRow = RowDataPacket & { constraint_name: string };

function statements(): string[] {
  return fs.readFileSync(path.resolve(process.cwd(), 'migrations', '014_access_cleanup.sql'), 'utf8')
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

async function count(sql: string): Promise<number> {
  const [[row]] = await pool.query<CountRow[]>(sql);
  return Number(row.total);
}

async function assertPreflight(): Promise<void> {
  const checks: Array<[string, string]> = [
    ['usuarios sin una asignación principal activa', `SELECT COUNT(*) total FROM (
      SELECT user.id FROM usuarios user
      LEFT JOIN usuario_asignaciones assignment
        ON assignment.usuario_id = user.id AND assignment.estado = 'ACTIVA'
       AND assignment.es_principal = 1 AND assignment.vigente_desde <= NOW()
       AND (assignment.vigente_hasta IS NULL OR assignment.vigente_hasta >= NOW())
      GROUP BY user.id HAVING COUNT(assignment.id) <> 1
    ) invalid_users`],
    ['usuarios cuyo tipo no coincide con su rol', `SELECT COUNT(*) total
      FROM usuarios user
      INNER JOIN usuario_asignaciones assignment
        ON assignment.usuario_id = user.id AND assignment.estado = 'ACTIVA'
       AND assignment.es_principal = 1
      INNER JOIN roles role ON role.id = assignment.rol_id
      WHERE user.tipo_usuario <> role.tipo_usuario`],
    ['asignaciones con alcance inconsistente', `SELECT COUNT(*) total
      FROM usuario_asignaciones WHERE estado = 'ACTIVA' AND (
        (alcance = 'SISTEMA' AND (empresa_id IS NOT NULL OR sede_id IS NOT NULL))
        OR (alcance = 'EMPRESA' AND (empresa_id IS NULL OR sede_id IS NOT NULL))
        OR (alcance = 'SEDE' AND (empresa_id IS NULL OR sede_id IS NULL))
      )`],
    ['sedes asignadas fuera de su empresa', `SELECT COUNT(*) total
      FROM usuario_asignaciones assignment
      INNER JOIN sedes site ON site.id = assignment.sede_id
      WHERE assignment.sede_id IS NOT NULL AND assignment.empresa_id <> site.empresa_id`],
  ];
  for (const [label, sql] of checks) {
    const total = await count(sql);
    if (total) throw new Error(`Preflight detenido: existen ${total} ${label}.`);
  }
}

async function dropLegacyForeignKeys(): Promise<void> {
  const [rows] = await pool.query<ForeignKeyRow[]>(
    `SELECT DISTINCT CONSTRAINT_NAME AS constraint_name
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'usuarios'
        AND COLUMN_NAME = 'sede_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL`,
  );
  for (const row of rows) {
    const safeName = row.constraint_name.replace(/`/g, '``');
    await pool.query(`ALTER TABLE usuarios DROP FOREIGN KEY \`${safeName}\``);
  }
}

async function main(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de migración.');

  try {
    const [applied] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM schema_migrations WHERE id = ?',
      [MIGRATION_ID],
    );
    if (applied.length) {
      console.log('Migración 014 de limpieza de accesos ya estaba aplicada.');
      return;
    }
    await assertPreflight();
    await dropLegacyForeignKeys();
    for (const statement of statements()) await pool.query(statement);
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migración 014 completada: columnas heredadas retiradas de usuarios.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main()
  .catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => pool.end());
