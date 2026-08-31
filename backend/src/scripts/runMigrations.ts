import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
const INITIAL_MIGRATION = '001_initial_schema';
const MIGRATION_LOCK = 'myg_express_schema_migrations';

type Migration = {
  id: string;
  filename: string;
  checksum: string;
  statements: string[];
};

type MigrationRow = RowDataPacket & { checksum: string | null };
type CountRow = RowDataPacket & { total: number };

function splitSqlStatements(source: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: "'" | '"' | '`' | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === '\n') {
        lineComment = false;
        current += '\n';
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
        current += ' ';
      }
      continue;
    }
    if (quote) {
      current += character;
      if (character === '\\') {
        if (next !== undefined) {
          current += next;
          index += 1;
        }
        continue;
      }
      if (character === quote && next === quote) {
        current += next;
        index += 1;
        continue;
      }
      if (character === quote) quote = null;
      continue;
    }

    if (character === '-' && next === '-' && /\s/.test(source[index + 2] || '')) {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '#') {
      lineComment = true;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      current += character;
      continue;
    }
    if (character === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }

  if (quote || blockComment) {
    throw new Error('La migración contiene una cadena o comentario sin cerrar.');
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function loadMigrations(): Migration[] {
  const directory = path.resolve(process.cwd(), 'migrations');
  const filenames = fs.readdirSync(directory)
    .filter((filename) => MIGRATION_FILE.test(filename))
    .sort((left, right) => left.localeCompare(right, 'en'));

  if (!filenames.length) throw new Error('No se encontraron migraciones SQL.');

  return filenames.map((filename) => {
    const source = fs.readFileSync(path.join(directory, filename), 'utf8');
    return {
      id: filename.replace(/\.sql$/, ''),
      filename,
      checksum: crypto.createHash('sha256').update(source).digest('hex'),
      statements: splitSqlStatements(source),
    };
  });
}

async function ensureMigrationRegistry(connection: PoolConnection): Promise<void> {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id VARCHAR(191) NOT NULL,
       checksum CHAR(64) NULL,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  const [columns] = await connection.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'schema_migrations'`,
  );
  const names = new Set(columns.map((row) => String(row.column_name)));
  if (!names.has('checksum')) {
    await connection.query('ALTER TABLE schema_migrations ADD COLUMN checksum CHAR(64) NULL AFTER id');
  }
}

async function assertInitialMigrationTargetsEmptyDatabase(
  connection: PoolConnection,
  migration: Migration,
): Promise<void> {
  if (migration.id !== INITIAL_MIGRATION) return;
  const [[row]] = await connection.query<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
        AND TABLE_NAME <> 'schema_migrations'`,
  );
  if (Number(row?.total || 0) > 0) {
    throw new Error(
      'La migración inicial solo puede aplicarse sobre una base vacía. '
      + 'Una base existente debe adoptar el baseline después de validar su esquema.',
    );
  }
}

async function applyMigration(connection: PoolConnection, migration: Migration): Promise<void> {
  const [rows] = await connection.query<MigrationRow[]>(
    'SELECT checksum FROM schema_migrations WHERE id = ? LIMIT 1',
    [migration.id],
  );

  if (rows.length) {
    const recordedChecksum = rows[0].checksum;
    if (recordedChecksum && recordedChecksum !== migration.checksum) {
      throw new Error(
        `La migración ${migration.filename} fue modificada después de aplicarse. `
        + 'Crea una migración nueva en lugar de reescribir el historial.',
      );
    }
    console.log(`[omitida] ${migration.filename}`);
    return;
  }

  await assertInitialMigrationTargetsEmptyDatabase(connection, migration);
  console.log(`[aplicando] ${migration.filename}`);
  for (const statement of migration.statements) await connection.query(statement);
  await connection.query(
    'INSERT INTO schema_migrations (id, checksum) VALUES (?, ?)',
    [migration.id, migration.checksum],
  );
  console.log(`[aplicada] ${migration.filename}`);
}

async function main(): Promise<void> {
  const migrations = loadMigrations();
  const connection = await pool.getConnection();
  let lockAcquired = false;

  try {
    const [[lock]] = await connection.query<RowDataPacket[]>(
      'SELECT GET_LOCK(?, 30) AS acquired',
      [MIGRATION_LOCK],
    );
    lockAcquired = Number(lock?.acquired || 0) === 1;
    if (!lockAcquired) throw new Error('No se pudo obtener el bloqueo exclusivo de migraciones.');

    await ensureMigrationRegistry(connection);
    for (const migration of migrations) await applyMigration(connection, migration);
    console.log(`Migraciones completadas: ${migrations.length} archivo(s) verificado(s).`);
  } finally {
    await connection.query('SET SESSION FOREIGN_KEY_CHECKS = 1').catch(() => undefined);
    if (lockAcquired) {
      await connection.query('SELECT RELEASE_LOCK(?)', [MIGRATION_LOCK]).catch(() => undefined);
    }
    connection.release();
  }
}

if (require.main === module) {
  void main()
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(async () => pool.end());
}

export const migrationRunnerInternals = { splitSqlStatements };
