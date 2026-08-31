import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';
import { executeMigrationStatement } from './migrationSql';

const MIGRATION_ID = '037_rrhh_payment_receipt_integrity';

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [applied] = await pool.query<RowDataPacket[]>('SELECT id FROM schema_migrations WHERE id = ?', [MIGRATION_ID]);
  if (applied.length) return console.log('Migracion 037 ya estaba aplicada.');
  const source = fs.readFileSync(path.resolve(process.cwd(), 'migrations', `${MIGRATION_ID}.sql`), 'utf8')
    .split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  for (const statement of source.split(';').map(value => value.trim()).filter(Boolean)) await executeMigrationStatement(pool, statement);
  await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
  console.log('Migracion 037 de integridad de RHE completada.');
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
