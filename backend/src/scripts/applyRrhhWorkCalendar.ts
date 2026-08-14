import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const MIGRATION_ID = '016_rrhh_work_calendar';
const LOCK_NAME = 'myg_rrhh_work_calendar';

type CountRow = RowDataPacket & { total: number };
type LockRow = RowDataPacket & { acquired: number };

function statements() {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations', '016_rrhh_work_calendar.sql'),
    'utf8',
  ).split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  return source.split(';').map(statement => statement.trim()).filter(Boolean);
}

async function assertPreflight() {
  const checks: Array<[string, string]> = [
    ['empleados con sedes inexistentes', `SELECT COUNT(*) total FROM personal_empleados employee
      LEFT JOIN sedes site ON site.id = employee.sede_id WHERE site.id IS NULL`],
    ['horarios sin versiones', `SELECT COUNT(*) total FROM personal_horarios schedule
      LEFT JOIN personal_horario_versiones version ON version.horario_id = schedule.id
      WHERE version.id IS NULL`],
  ];
  for (const [label, sql] of checks) {
    const [[row]] = await pool.query<CountRow[]>(sql);
    if (Number(row.total) !== 0) throw new Error(`Preflight detenido: existen ${label}.`);
  }
}

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de migracion del calendario laboral.');
  try {
    const [applied] = await pool.query<RowDataPacket[]>('SELECT id FROM schema_migrations WHERE id = ?', [MIGRATION_ID]);
    if (applied.length) {
      console.log('Migracion 016 ya estaba aplicada.');
      return;
    }
    await assertPreflight();
    for (const statement of statements()) await pool.query(statement);
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migracion 016 de calendario laboral completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
