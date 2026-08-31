import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const LOCK_NAME = 'myg_integrity_repair';

type LockRow = RowDataPacket & { acquired: number };
type ExistsRow = RowDataPacket & { total: number };

type NullableReference = {
  label: string;
  sourceTable: string;
  sourceIdColumn?: string;
  sourceColumn: string;
  referencedTable: string;
  referencedColumn: string;
};

// Estas relaciones usan ON DELETE SET NULL. Si una instalación antigua ya
// perdió el registro padre, conservar la fila hija y retirar solo el vínculo
// inválido es la reparación menos destructiva.
const nullableReferences: NullableReference[] = [
  { label: 'avisos_sesion', sourceTable: 'avisos_diarios', sourceColumn: 'whatsapp_sesion_id', referencedTable: 'whatsapp_sesiones', referencedColumn: 'id' },
  { label: 'avisos_plantilla', sourceTable: 'avisos_diarios', sourceColumn: 'id_plantilla', referencedTable: 'plantillas', referencedColumn: 'id' },
  { label: 'avisos_marcado_usuario', sourceTable: 'avisos_diarios', sourceColumn: 'marcado_manual_por', referencedTable: 'usuarios', referencedColumn: 'id' },
  { label: 'avisos_entregado_usuario', sourceTable: 'avisos_diarios', sourceColumn: 'entregado_por', referencedTable: 'usuarios', referencedColumn: 'id' },
  { label: 'mensajes_lote', sourceTable: 'mensajes_log', sourceColumn: 'lote_id', referencedTable: 'lotes_carga', referencedColumn: 'id' },
  { label: 'mensajes_aviso', sourceTable: 'mensajes_log', sourceColumn: 'aviso_id', referencedTable: 'avisos_diarios', referencedColumn: 'id' },
  { label: 'mensajes_sesion', sourceTable: 'mensajes_log', sourceColumn: 'whatsapp_sesion_id', referencedTable: 'whatsapp_sesiones', referencedColumn: 'id' },
  { label: 'sede_config_plantilla', sourceTable: 'sede_configuracion', sourceIdColumn: 'sede_id', sourceColumn: 'plantilla_whatsapp_default_id', referencedTable: 'plantillas', referencedColumn: 'id' },
];

function quoteIdentifier(value: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error(`Identificador SQL no permitido: ${value}`);
  return `\`${value}\``;
}

async function tableExists(table: string): Promise<boolean> {
  const [[row]] = await pool.query<ExistsRow[]>(
    'SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  );
  return Number(row?.total || 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const [[row]] = await pool.query<ExistsRow[]>(
    `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(row?.total || 0) > 0;
}

async function isAvailable(reference: NullableReference): Promise<boolean> {
  return (await tableExists(reference.sourceTable))
    && (await tableExists(reference.referencedTable))
    && (await columnExists(reference.sourceTable, reference.sourceColumn))
    && (await columnExists(reference.referencedTable, reference.referencedColumn));
}

async function repair(reference: NullableReference): Promise<number> {
  if (!(await isAvailable(reference))) {
    console.log(`SKIP ${reference.label}: estructura todavía no disponible`);
    return 0;
  }

  const sourceTable = quoteIdentifier(reference.sourceTable);
  const sourceIdColumn = quoteIdentifier(reference.sourceIdColumn || 'id');
  const sourceColumn = quoteIdentifier(reference.sourceColumn);
  const referencedTable = quoteIdentifier(reference.referencedTable);
  const referencedColumn = quoteIdentifier(reference.referencedColumn);

  await pool.query('START TRANSACTION');
  try {
    await pool.query(
      `INSERT IGNORE INTO migration_integrity_repairs
        (repair_key, source_table, source_id, source_column, previous_value, repair_action)
       SELECT ?, ?, CAST(source.${sourceIdColumn} AS CHAR), ?, CAST(source.${sourceColumn} AS CHAR), 'SET_NULL_ORPHAN'
         FROM ${sourceTable} source
         LEFT JOIN ${referencedTable} parent ON parent.${referencedColumn} = source.${sourceColumn}
        WHERE source.${sourceColumn} IS NOT NULL AND parent.${referencedColumn} IS NULL`,
      [reference.label, reference.sourceTable, reference.sourceColumn],
    );

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE ${sourceTable} source
         LEFT JOIN ${referencedTable} parent ON parent.${referencedColumn} = source.${sourceColumn}
          SET source.${sourceColumn} = NULL
        WHERE source.${sourceColumn} IS NOT NULL AND parent.${referencedColumn} IS NULL`,
    );
    await pool.query('COMMIT');
    console.log(`${result.affectedRows ? 'REPAIRED' : 'OK'} ${reference.label}: ${result.affectedRows}`);
    return result.affectedRows;
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de reparación de integridad.');

  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS migration_integrity_repairs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      repair_key VARCHAR(80) NOT NULL,
      source_table VARCHAR(80) NOT NULL,
      source_id VARCHAR(80) NOT NULL,
      source_column VARCHAR(80) NOT NULL,
      previous_value VARCHAR(255) NOT NULL,
      repair_action VARCHAR(40) NOT NULL,
      repaired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_integrity_repair_source (repair_key, source_table, source_id, source_column, previous_value, repair_action),
      KEY idx_integrity_repair_date (repaired_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    let repaired = 0;
    for (const reference of nullableReferences) repaired += await repair(reference);
    console.log(`Reparación conservadora finalizada: ${repaired} vínculos opcionales normalizados.`);
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
