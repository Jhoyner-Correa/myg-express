import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';
import { executeMigrationStatement } from './migrationSql';

const MIGRATION_ID = '010_rrhh_schedule_policies';
const LOCK_NAME = 'myg_rrhh_schedule_policies';

type CountRow = RowDataPacket & { total: number };
type LockRow = RowDataPacket & { acquired: number };

function statements() {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations', '010_rrhh_schedule_policies.sql'),
    'utf8',
  ).split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  return source.split(';').map(statement => statement.trim()).filter(Boolean);
}

async function assertPreflight() {
  const checks: Array<[string, string]> = [
    ['horarios inválidos', `SELECT COUNT(*) total FROM personal_horarios
      WHERE nombre IS NULL OR TRIM(nombre) = '' OR hora_entrada IS NULL OR hora_salida IS NULL
        OR hora_entrada = hora_salida OR tolerancia_minutos < 0 OR tolerancia_minutos > 180`],
    ['nombres duplicados', `SELECT COUNT(*) total FROM (
      SELECT LOWER(TRIM(nombre)) FROM personal_horarios GROUP BY LOWER(TRIM(nombre)) HAVING COUNT(*) > 1
    ) duplicate_names`],
    ['asignaciones huérfanas', `SELECT COUNT(*) total FROM personal_empleado_horarios assignment
      LEFT JOIN personal_empleados employee ON employee.id = assignment.empleado_id
      LEFT JOIN personal_horarios schedule ON schedule.id = assignment.horario_id
      WHERE employee.id IS NULL OR schedule.id IS NULL`],
  ];
  for (const [label, sql] of checks) {
    const [[row]] = await pool.query<CountRow[]>(sql);
    if (Number(row.total) !== 0) throw new Error(`Preflight detenido: existen ${label}.`);
  }
}

async function constraintExists(name: string) {
  const [[row]] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) total FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`,
    [name],
  );
  return Number(row.total) > 0;
}

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de migración RR. HH.');
  try {
    const [applied] = await pool.query<RowDataPacket[]>('SELECT id FROM schema_migrations WHERE id = ?', [MIGRATION_ID]);
    if (applied.length) {
      console.log('Migración 010 ya estaba aplicada.');
      return;
    }
    await assertPreflight();
    for (const statement of statements()) {
      const constraint = /ADD\s+CONSTRAINT\s+([a-zA-Z0-9_]+)/i.exec(statement)?.[1];
      if (constraint && await constraintExists(constraint)) continue;
      await executeMigrationStatement(pool, statement);
    }
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migración 010 de políticas de horario completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
