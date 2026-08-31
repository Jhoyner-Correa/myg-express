import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';
import { executeMigrationStatements } from './migrationSql';

const MIGRATION_ID = '032_rrhh_schema_governance';
const LOCK_NAME = 'myg_rrhh_schema_governance';

type CountRow = RowDataPacket & { total: number };
type LockRow = RowDataPacket & { acquired: number };

function statements(): string[] {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations', '032_rrhh_schema_governance.sql'),
    'utf8',
  ).split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  return source.split(';').map(statement => statement.trim()).filter(Boolean);
}

async function assertPreflight(): Promise<void> {
  const [[orphanSites]] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM personal_empleados employee
       LEFT JOIN sedes site ON site.id = employee.sede_id
      WHERE site.id IS NULL`,
  );
  if (Number(orphanSites.total) !== 0) {
    throw new Error('Preflight detenido: existen colaboradores asociados a sedes inexistentes.');
  }

  const [[invalidDates]] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM personal_empleados
      WHERE fecha_cese IS NOT NULL AND fecha_cese < fecha_ingreso`,
  );
  if (Number(invalidDates.total) !== 0) {
    throw new Error('Preflight detenido: existen fechas de cese anteriores a la fecha de ingreso.');
  }
}

async function main(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) {
    throw new Error('No se pudo adquirir el candado de gobierno del esquema RR. HH.');
  }

  try {
    const [applied] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM schema_migrations WHERE id = ?',
      [MIGRATION_ID],
    );
    if (applied.length) {
      console.log('Migracion 032 ya estaba aplicada.');
      return;
    }

    await assertPreflight();
    await executeMigrationStatements(pool, statements());
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migracion 032 de gobierno del esquema RR. HH. completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
