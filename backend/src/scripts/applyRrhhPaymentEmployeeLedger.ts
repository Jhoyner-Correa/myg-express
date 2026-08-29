import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

type LockRow = RowDataPacket & { acquired: number };
const MIGRATION_ID = '039_rrhh_payment_employee_ledger';
const LOCK_NAME = 'myg_rrhh_payment_employee_ledger';

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado del expediente individual de pagos.');
  try {
    const [applied] = await pool.query<RowDataPacket[]>('SELECT id FROM schema_migrations WHERE id = ?', [MIGRATION_ID]);
    if (applied.length) return console.log('Migracion 039 ya estaba aplicada.');
    const source = fs.readFileSync(path.resolve(process.cwd(), 'migrations', `${MIGRATION_ID}.sql`), 'utf8')
      .split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
    for (const statement of source.split(';').map(value => value.trim()).filter(Boolean)) await pool.query(statement);
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migracion 039 del expediente individual de pagos completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
