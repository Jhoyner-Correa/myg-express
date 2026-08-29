import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';
import { executeMigrationStatements } from './migrationSql';

type LockRow = RowDataPacket & { acquired: number };
const LOCK_NAME = 'myg_rrhh_incident_workflows';

function loadStatements() {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations', '007_rrhh_incident_workflows.sql'),
    'utf8',
  ).split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  return source.split(';').map(statement => statement.trim()).filter(Boolean);
}

async function main() {
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de migración RR. HH.');
  try {
    await executeMigrationStatements(pool, loadStatements());
    console.log('Migración 007 de incidencias RR. HH. completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
