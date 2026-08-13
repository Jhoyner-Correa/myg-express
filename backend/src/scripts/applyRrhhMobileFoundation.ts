import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const LOCK_NAME = 'myg_rrhh_mobile_foundation';

type CountRow = RowDataPacket & { total: number };
type LockRow = RowDataPacket & { acquired: number };

async function count(sql: string): Promise<number> {
  const [[row]] = await pool.query<CountRow[]>(sql);
  return Number(row?.total || 0);
}

function loadStatements(): string[] {
  const migrationPath = path.resolve(process.cwd(), 'migrations', '006_rrhh_mobile_foundation.sql');
  const source = fs.readFileSync(migrationPath, 'utf8')
    .split(/\r?\n/)
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n');

  return source
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);
}

async function runPreflight() {
  const checks = [
    {
      label: 'marcaciones duplicadas por jornada y tipo',
      total: await count(`SELECT COUNT(*) AS total FROM (
        SELECT asistencia_id, tipo_marcacion
          FROM personal_marcaciones
         GROUP BY asistencia_id, tipo_marcacion
        HAVING COUNT(*) > 1
      ) duplicate_marks`),
    },
    {
      label: 'empleados con multiples dispositivos autorizados',
      total: await count(`SELECT COUNT(*) AS total FROM (
        SELECT empleado_id
          FROM personal_dispositivos
         WHERE estado = 'AUTORIZADO'
         GROUP BY empleado_id
        HAVING COUNT(*) > 1
      ) duplicate_devices`),
    },
  ];

  const failures = checks.filter(check => check.total > 0);
  if (failures.length) {
    console.table(failures);
    throw new Error('El preflight de RR. HH. detecto datos incompatibles. No se modifico la estructura.');
  }
}

async function main() {
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) {
    throw new Error('No se pudo adquirir el candado de migracion de RR. HH.');
  }

  try {
    await runPreflight();
    for (const statement of loadStatements()) {
      await pool.query(statement);
    }

    console.log('Migracion RR. HH. mobile foundation completada.');
    console.table({
      sesiones: await count('SELECT COUNT(*) AS total FROM personal_sesiones_app'),
      activaciones: await count('SELECT COUNT(*) AS total FROM personal_activaciones_dispositivo'),
      evidencias: await count('SELECT COUNT(*) AS total FROM personal_evidencias_marcacion'),
      auditoria: await count('SELECT COUNT(*) AS total FROM personal_auditoria_eventos'),
    });
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
