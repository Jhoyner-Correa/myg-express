import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const MIGRATION_ID = '038_rrhh_payment_legacy_batches';

async function main() {
  const [applied] = await pool.query<RowDataPacket[]>('SELECT id FROM schema_migrations WHERE id = ?', [MIGRATION_ID]);
  if (applied.length) return console.log('Migracion 038 ya estaba aplicada.');
  const source = fs.readFileSync(path.resolve(process.cwd(), 'migrations', `${MIGRATION_ID}.sql`), 'utf8')
    .split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  for (const statement of source.split(';').map(value => value.trim()).filter(Boolean)) await pool.query(statement);
  await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
  console.log('Migracion 038 de lotes historicos completada.');
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
