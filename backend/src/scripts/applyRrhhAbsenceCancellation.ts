import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';
import { executeMigrationStatements } from './migrationSql';

type LockRow = RowDataPacket & { acquired: number };
const MIGRATION_ID = '029_rrhh_absence_cancellation';
const LOCK_NAME = 'myg_rrhh_absence_cancellation';

function loadStatements() {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations', '029_rrhh_absence_cancellation.sql'),
    'utf8',
  ).split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  return source.split(';').map(statement => statement.trim()).filter(Boolean);
}

async function addForeignKeyIfMissing(table: string, name: string, column: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? LIMIT 1`,
    [name],
  );
  if (!rows.length) {
    await pool.query(
      `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${column})
       REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE`,
    );
  }
}

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de migracion RR. HH.');
  try {
    const [applied] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM schema_migrations WHERE id = ?',
      [MIGRATION_ID],
    );
    if (applied.length) {
      console.log('Migracion 029 ya estaba aplicada.');
      return;
    }
    await executeMigrationStatements(pool, loadStatements());
    await addForeignKeyIfMissing('personal_solicitudes_permisos', 'fk_personal_permisos_cancelado_por', 'cancelado_por');
    await addForeignKeyIfMissing('personal_vacaciones', 'fk_personal_vacaciones_cancelado_por', 'cancelado_por');
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migracion 029 de cancelacion de solicitudes RR. HH. completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
