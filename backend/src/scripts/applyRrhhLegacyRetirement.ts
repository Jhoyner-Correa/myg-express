import fs from 'fs';
import path from 'path';
import { RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const MIGRATION_ID = '033_rrhh_legacy_retirement';
const LOCK_NAME = 'myg_rrhh_legacy_retirement';

const LEGACY_TABLES = [
  'personal_empleado_horarios',
  'personal_horas_extras',
  'personal_notificaciones',
  'personal_auditoria_accesos',
] as const;

type CountRow = RowDataPacket & { total: number };
type LockRow = RowDataPacket & { acquired: number };
type AssignmentRow = RowDataPacket & {
  empleado_id: number;
  horario_id: number;
  dia_semana: number;
  vigente_desde: string;
  vigente_hasta: string | null;
};

function statements(): string[] {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'migrations', '033_rrhh_legacy_retirement.sql'),
    'utf8',
  ).split(/\r?\n/).filter(line => !line.trimStart().startsWith('--')).join('\n');
  return source.split(';').map(statement => statement.trim()).filter(Boolean);
}

function epochDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function assignmentKey(row: AssignmentRow): string {
  return `${row.empleado_id}:${row.horario_id}:${row.dia_semana}`;
}

function assertCovered(legacy: AssignmentRow, canonical: AssignmentRow[]): void {
  const start = epochDay(legacy.vigente_desde);
  const end = legacy.vigente_hasta ? epochDay(legacy.vigente_hasta) : Number.POSITIVE_INFINITY;
  const intervals = canonical
    .filter(item => assignmentKey(item) === assignmentKey(legacy))
    .map(item => ({
      start: epochDay(item.vigente_desde),
      end: item.vigente_hasta ? epochDay(item.vigente_hasta) : Number.POSITIVE_INFINITY,
    }))
    .filter(item => item.end >= start && item.start <= end)
    .sort((left, right) => left.start - right.start);

  let coveredUntil = start - 1;
  for (const interval of intervals) {
    if (interval.start > coveredUntil + 1) break;
    coveredUntil = Math.max(coveredUntil, interval.end);
    if (coveredUntil >= end) return;
  }
  throw new Error(
    `No se puede retirar personal_empleado_horarios: falta cobertura canónica para ${assignmentKey(legacy)} desde ${legacy.vigente_desde}.`,
  );
}

async function tableExists(table: string): Promise<boolean> {
  const [[row]] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) total
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return Number(row.total) > 0;
}

async function assertPreflight(): Promise<void> {
  if (await tableExists('personal_empleado_horarios')) {
    const [legacyAssignments] = await pool.query<AssignmentRow[]>(
      `SELECT empleado_id, horario_id, dia_semana,
              DATE_FORMAT(vigente_desde, '%Y-%m-%d') vigente_desde,
              DATE_FORMAT(vigente_hasta, '%Y-%m-%d') vigente_hasta
         FROM personal_empleado_horarios`,
    );
    const [canonicalAssignments] = await pool.query<AssignmentRow[]>(
      `SELECT empleado_id, horario_id, dia_semana,
              DATE_FORMAT(vigente_desde, '%Y-%m-%d') vigente_desde,
              DATE_FORMAT(vigente_hasta, '%Y-%m-%d') vigente_hasta
         FROM personal_horario_asignaciones
        WHERE alcance = 'EMPLEADO'`,
    );
    for (const legacy of legacyAssignments) assertCovered(legacy, canonicalAssignments);
  }

  if (await tableExists('personal_horas_extras')) {
    const [[orphanOvertime]] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) total
         FROM personal_horas_extras legacy
         LEFT JOIN personal_asistencias attendance ON attendance.id = legacy.asistencia_id
        WHERE attendance.id IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM personal_marcaciones mark
              WHERE mark.asistencia_id = legacy.asistencia_id
                AND mark.tipo_marcacion = 'SALIDA'
           )`,
    );
    if (Number(orphanOvertime.total) > 0) {
      throw new Error('Preflight detenido: existen horas extra legadas sin asistencia o salida final asociada.');
    }
  }

  if (await tableExists('personal_notificaciones')) {
    const [[orphanNotifications]] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) total
         FROM personal_notificaciones legacy
         LEFT JOIN personal_empleados employee ON employee.id = legacy.empleado_id
        WHERE employee.id IS NULL`,
    );
    if (Number(orphanNotifications.total) > 0) {
      throw new Error('Preflight detenido: existen notificaciones legadas sin colaborador asociado.');
    }
  }

  if (await tableExists('personal_auditoria_accesos')) {
    const [[legacyAudit]] = await pool.query<CountRow[]>(
      'SELECT COUNT(*) total FROM personal_auditoria_accesos',
    );
    if (Number(legacyAudit.total) > 0) {
      throw new Error('Preflight detenido: personal_auditoria_accesos todavía contiene registros por migrar.');
    }
  }
}

async function main(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de retiro legado RR. HH.');

  try {
    const [applied] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM schema_migrations WHERE id = ?',
      [MIGRATION_ID],
    );
    if (applied.length) {
      console.log('Migración 033 ya estaba aplicada.');
      return;
    }

    await assertPreflight();
    const existingLegacyTables = new Set<string>();
    for (const table of LEGACY_TABLES) {
      if (await tableExists(table)) existingLegacyTables.add(table);
    }
    for (const statement of statements()) {
      if (/\bFROM\s+personal_horas_extras\b/i.test(statement)
        && !existingLegacyTables.has('personal_horas_extras')) continue;
      if (/\bFROM\s+personal_notificaciones\b/i.test(statement)
        && !existingLegacyTables.has('personal_notificaciones')) continue;
      await pool.query(statement);
    }
    await pool.query('INSERT INTO schema_migrations (id) VALUES (?)', [MIGRATION_ID]);
    console.log('Migración 033 de retiro de tablas legadas completada.');
  } finally {
    await pool.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
