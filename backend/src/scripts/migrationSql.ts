import { RowDataPacket } from 'mysql2/promise';

type MigrationQueryable = {
  query: (sql: string, values?: unknown[]) => Promise<unknown>;
};

type CountRow = RowDataPacket & { total: number };

function identifier(value: string): string {
  return value.replace(/^`|`$/g, '');
}

function splitTopLevelClauses(source: string): string[] {
  const clauses: string[] = [];
  let current = '';
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let escaped = false;

  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (quote && character === '\\') {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (character === ',' && depth === 0) {
      if (current.trim()) clauses.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) clauses.push(current.trim());
  return clauses;
}

async function exists(
  queryable: MigrationQueryable,
  source: 'COLUMNS' | 'STATISTICS' | 'TABLE_CONSTRAINTS' | 'REFERENTIAL_CONSTRAINTS',
  table: string,
  nameColumn: string,
  name: string,
): Promise<boolean> {
  const schemaColumn = source === 'REFERENTIAL_CONSTRAINTS'
    ? 'CONSTRAINT_SCHEMA'
    : 'TABLE_SCHEMA';
  const result = await queryable.query(
    `SELECT COUNT(*) AS total FROM information_schema.${source}
      WHERE ${schemaColumn} = DATABASE() AND TABLE_NAME = ? AND ${nameColumn} = ?`,
    [table, name],
  ) as [CountRow[], unknown];
  return Number(result[0][0]?.total || 0) > 0;
}

async function executeAlterClause(
  queryable: MigrationQueryable,
  tableToken: string,
  clause: string,
): Promise<void> {
  const table = identifier(tableToken);
  const addColumn = /^ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+(`?[A-Za-z0-9_]+`?)\s+([\s\S]+)$/i.exec(clause);
  if (addColumn) {
    const column = identifier(addColumn[1]);
    if (!await exists(queryable, 'COLUMNS', table, 'COLUMN_NAME', column)) {
      await queryable.query(`ALTER TABLE ${tableToken} ADD COLUMN ${addColumn[1]} ${addColumn[2]}`);
    }
    return;
  }

  const dropColumn = /^DROP\s+COLUMN\s+IF\s+EXISTS\s+(`?[A-Za-z0-9_]+`?)$/i.exec(clause);
  if (dropColumn) {
    const column = identifier(dropColumn[1]);
    if (await exists(queryable, 'COLUMNS', table, 'COLUMN_NAME', column)) {
      await queryable.query(`ALTER TABLE ${tableToken} DROP COLUMN ${dropColumn[1]}`);
    }
    return;
  }

  const addIndex = /^ADD\s+(UNIQUE\s+)?(?:KEY|INDEX)\s+IF\s+NOT\s+EXISTS\s+(`?[A-Za-z0-9_]+`?)\s+([\s\S]+)$/i.exec(clause);
  if (addIndex) {
    const index = identifier(addIndex[2]);
    if (!await exists(queryable, 'STATISTICS', table, 'INDEX_NAME', index)) {
      await queryable.query(
        `ALTER TABLE ${tableToken} ADD ${addIndex[1] || ''}KEY ${addIndex[2]} ${addIndex[3]}`,
      );
    }
    return;
  }

  const dropIndex = /^DROP\s+(?:INDEX|KEY)\s+IF\s+EXISTS\s+(`?[A-Za-z0-9_]+`?)$/i.exec(clause);
  if (dropIndex) {
    const index = identifier(dropIndex[1]);
    if (await exists(queryable, 'STATISTICS', table, 'INDEX_NAME', index)) {
      await queryable.query(`ALTER TABLE ${tableToken} DROP INDEX ${dropIndex[1]}`);
    }
    return;
  }

  const dropForeignKey = /^DROP\s+FOREIGN\s+KEY\s+IF\s+EXISTS\s+(`?[A-Za-z0-9_]+`?)$/i.exec(clause);
  if (dropForeignKey) {
    const constraint = identifier(dropForeignKey[1]);
    if (await exists(queryable, 'REFERENTIAL_CONSTRAINTS', table, 'CONSTRAINT_NAME', constraint)) {
      await queryable.query(`ALTER TABLE ${tableToken} DROP FOREIGN KEY ${dropForeignKey[1]}`);
    }
    return;
  }

  const addConstraint = /^ADD\s+CONSTRAINT\s+(`?[A-Za-z0-9_]+`?)\s+([\s\S]+)$/i.exec(clause);
  if (addConstraint) {
    const constraint = identifier(addConstraint[1]);
    if (!await exists(queryable, 'TABLE_CONSTRAINTS', table, 'CONSTRAINT_NAME', constraint)) {
      await queryable.query(`ALTER TABLE ${tableToken} ${clause}`);
    }
    return;
  }

  await queryable.query(`ALTER TABLE ${tableToken} ${clause}`);
}

export async function executeMigrationStatement(
  queryable: MigrationQueryable,
  statement: string,
): Promise<void> {
  // VIRTUAL mantiene la misma clave funcional y evita que MySQL reconstruya
  // como STORED una tabla que ya participa en claves foráneas con CASCADE.
  const compatibleStatement = statement.replace(/\bPERSISTENT\b/gi, 'VIRTUAL');
  const createIndex = /^CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+(`?[A-Za-z0-9_]+`?)\s+ON\s+(`?[A-Za-z0-9_]+`?)\s+([\s\S]+)$/i.exec(compatibleStatement);
  if (createIndex) {
    const index = identifier(createIndex[2]);
    const table = identifier(createIndex[3]);
    if (!await exists(queryable, 'STATISTICS', table, 'INDEX_NAME', index)) {
      await queryable.query(
        `CREATE ${createIndex[1] || ''}INDEX ${createIndex[2]} ON ${createIndex[3]} ${createIndex[4]}`,
      );
    }
    return;
  }

  const dropIndex = /^DROP\s+INDEX\s+IF\s+EXISTS\s+(`?[A-Za-z0-9_]+`?)\s+ON\s+(`?[A-Za-z0-9_]+`?)$/i.exec(compatibleStatement);
  if (dropIndex) {
    const index = identifier(dropIndex[1]);
    const table = identifier(dropIndex[2]);
    if (await exists(queryable, 'STATISTICS', table, 'INDEX_NAME', index)) {
      await queryable.query(`DROP INDEX ${dropIndex[1]} ON ${dropIndex[2]}`);
    }
    return;
  }

  const alter = /^ALTER\s+TABLE\s+(`?[A-Za-z0-9_]+`?)\s+([\s\S]+)$/i.exec(compatibleStatement);
  if (alter && /\bIF\s+(?:NOT\s+)?EXISTS\b|\bADD\s+CONSTRAINT\b/i.test(alter[2])) {
    for (const clause of splitTopLevelClauses(alter[2])) {
      await executeAlterClause(queryable, alter[1], clause);
    }
    return;
  }

  await queryable.query(compatibleStatement);
}

export async function executeMigrationStatements(
  queryable: MigrationQueryable,
  statements: string[],
): Promise<void> {
  for (const statement of statements) await executeMigrationStatement(queryable, statement);
}

export const migrationSqlInternals = { splitTopLevelClauses };
