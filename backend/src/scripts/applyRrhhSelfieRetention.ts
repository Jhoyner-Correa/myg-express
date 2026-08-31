import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';
import { executeMigrationStatements } from './migrationSql';

const MIGRATION_ID = '025_rrhh_selfie_retention';
const LOCK_NAME = 'myg_rrhh_selfie_retention';
type LockRow = RowDataPacket & { acquired: number };

function statements(): string[] {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations', '025_rrhh_selfie_retention.sql'),
    'utf8',
  ).split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  return source.split(';').map(statement => statement.trim()).filter(Boolean);
}

async function main(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de retencion de selfies.');
  try {
    const [applied] = await pool.query<RowDataPacket[]>('SELECT id FROM schema_migrations WHERE id = ?', [MIGRATION_ID]);
    if (applied.length) {
      console.log('Migracion 025 ya estaba aplicada.');
      return;
    }
    await executeMigrationStatements(pool, statements());
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migracion 025 de retencion de selfies completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
