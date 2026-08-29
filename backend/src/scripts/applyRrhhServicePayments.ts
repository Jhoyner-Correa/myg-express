import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

type LockRow = RowDataPacket & { acquired: number };
const MIGRATION_ID = '035_rrhh_service_payments';
const LOCK_NAME = 'myg_rrhh_service_payments';

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de migracion de pagos RR. HH.');
  try {
    const [applied] = await pool.query<RowDataPacket[]>('SELECT id FROM schema_migrations WHERE id = ?', [MIGRATION_ID]);
    if (applied.length) {
      console.log('Migracion 035 ya estaba aplicada.');
      return;
    }
    const source = fs.readFileSync(path.resolve(process.cwd(), 'migrations', `${MIGRATION_ID}.sql`), 'utf8')
      .split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
    for (const statement of source.split(';').map(value => value.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migracion 035 de pagos por servicios completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
