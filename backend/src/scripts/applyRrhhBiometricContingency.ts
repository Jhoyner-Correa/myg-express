import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

type LockRow = RowDataPacket & { acquired: number };
const LOCK_NAME = 'myg_rrhh_biometric_contingency';

function loadStatements() {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations', '008_rrhh_biometric_contingency.sql'),
    'utf8',
  ).split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  return source.split(';').map(statement => statement.trim()).filter(Boolean);
}

async function main() {
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de migracion RR. HH.');
  try {
    for (const statement of loadStatements()) await pool.query(statement);
    console.log('Migracion 008 de contingencia biometrica completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
