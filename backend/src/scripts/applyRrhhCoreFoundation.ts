import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const MIGRATION_ID = '000_rrhh_core_foundation';
const LOCK_NAME = 'myg_rrhh_core_foundation';

type MigrationRow = RowDataPacket & { id: string };
type LockRow = RowDataPacket & { acquired: number };
type ExistsRow = RowDataPacket & { total: number };

function statements(): string[] {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'migrations', `${MIGRATION_ID}.sql`), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  return source.split(';').map((statement) => statement.trim()).filter(Boolean);
}

async function tableExists(table: string): Promise<boolean> {
  const [[row]] = await pool.query<ExistsRow[]>(
    'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
    [table],
  );
  return Number(row?.total || 0) > 0;
}

async function main() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de la base de RR. HH.');

  try {
    const [applied] = await pool.query<MigrationRow[]>('SELECT id FROM schema_migrations WHERE id=?', [MIGRATION_ID]);
    if (!applied.length) {
      for (const statement of statements()) await pool.query(statement);
      await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    }

    const required = [
      'personal_cargos', 'personal_horarios', 'personal_empleados',
      'personal_asistencias', 'personal_marcaciones', 'personal_dispositivos', 'personal_acceso_app',
      'personal_configuracion_gps_sedes', 'personal_gps_tiempo_real', 'personal_gps_historial',
      'personal_solicitudes_permisos', 'personal_vacaciones',
    ];
    const [retirement] = await pool.query<MigrationRow[]>(
      'SELECT id FROM schema_migrations WHERE id=?',
      ['033_rrhh_legacy_retirement'],
    );
    if (!retirement.length) required.push('personal_empleado_horarios');
    const missing: string[] = [];
    for (const table of required) if (!(await tableExists(table))) missing.push(table);
    if (missing.length) throw new Error(`La base de RR. HH. quedó incompleta: ${missing.join(', ')}`);
    console.log('Base instalable de RR. HH. verificada correctamente.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => pool.end());
