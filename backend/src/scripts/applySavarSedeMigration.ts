import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../core/database/database';

const LOCK_NAME = 'myg_savar_sede_migration';

type CountRow = RowDataPacket & { total: number };
type LockRow = RowDataPacket & { acquired: number };
type LotAuditRow = RowDataPacket & {
  lote: string;
  paquetes: number;
  sedes_detectadas: string | null;
};

async function columnExists(column: string) {
  const [[row]] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paquetes' AND COLUMN_NAME = ?`,
    [column],
  );
  return Number(row?.total) > 0;
}

async function indexExists(index: string) {
  const [[row]] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'paquetes' AND INDEX_NAME = ?`,
    [index],
  );
  return Number(row?.total) > 0;
}

async function foreignKeyExists(constraint: string) {
  const [[row]] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`,
    [constraint],
  );
  return Number(row?.total) > 0;
}

async function main() {
  const [[lock]] = await pool.query<LockRow[]>('SELECT GET_LOCK(?, 15) AS acquired', [LOCK_NAME]);
  if (Number(lock?.acquired) !== 1) throw new Error('No se pudo adquirir el candado de migración de SAVAR SCAN.');

  try {
    if (!await columnExists('sede_id')) {
      await pool.query('ALTER TABLE paquetes ADD COLUMN sede_id INT(10) UNSIGNED NULL AFTER id');
      console.log('OK columna paquetes.sede_id creada');
    }

    const [sharedLots] = await pool.query<LotAuditRow[]>(
      `SELECT lote_importacion AS lote, COUNT(*) AS paquetes,
              GROUP_CONCAT(DISTINCT sede_id_escaneo ORDER BY sede_id_escaneo) AS sedes_detectadas
         FROM paquetes
        WHERE sede_id IS NULL
        GROUP BY lote_importacion
       HAVING COUNT(DISTINCT sede_id_escaneo) > 1`,
    );
    if (sharedLots.length) {
      console.error('Lotes operados históricamente por más de una sede:');
      console.table(sharedLots);
      throw new Error('La migración se detuvo antes del backfill: distribuya manualmente esos lotes por sede.');
    }

    await pool.query<ResultSetHeader>(
      'UPDATE paquetes SET sede_id = sede_id_escaneo WHERE sede_id IS NULL AND sede_id_escaneo IS NOT NULL',
    );
    await pool.query<ResultSetHeader>(
      `UPDATE paquetes package_item
         JOIN (
           SELECT lote_importacion, MIN(sede_id_escaneo) AS sede_id
             FROM paquetes
            WHERE sede_id_escaneo IS NOT NULL
            GROUP BY lote_importacion
           HAVING COUNT(DISTINCT sede_id_escaneo) = 1
         ) inferred ON inferred.lote_importacion = package_item.lote_importacion
          SET package_item.sede_id = inferred.sede_id
        WHERE package_item.sede_id IS NULL`,
    );
    await pool.query<ResultSetHeader>(
      `UPDATE paquetes package_item
         JOIN (
           SELECT MIN(id) AS sede_id
             FROM sedes
            WHERE estado = 'activo'
           HAVING COUNT(*) = 1
         ) single_sede
          SET package_item.sede_id = single_sede.sede_id
        WHERE package_item.sede_id IS NULL`,
    );

    const [ambiguous] = await pool.query<LotAuditRow[]>(
      `SELECT lote_importacion AS lote, COUNT(*) AS paquetes,
              GROUP_CONCAT(DISTINCT sede_id_escaneo ORDER BY sede_id_escaneo) AS sedes_detectadas
         FROM paquetes
        WHERE sede_id IS NULL
        GROUP BY lote_importacion`,
    );
    if (ambiguous.length) {
      console.error('Lotes que requieren asignación manual de sede_id:');
      console.table(ambiguous);
      throw new Error('La migración se detuvo sin eliminar datos porque existen lotes con sede ambigua.');
    }

    await pool.query('ALTER TABLE paquetes MODIFY COLUMN sede_id INT(10) UNSIGNED NOT NULL');

    const [[duplicates]] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
         FROM (
           SELECT sede_id, codigo_paquete
             FROM paquetes
            GROUP BY sede_id, codigo_paquete
           HAVING COUNT(*) > 1
         ) duplicate_codes`,
    );
    if (Number(duplicates?.total) > 0) {
      throw new Error('Existen códigos duplicados dentro de una misma sede; resuélvalos antes de crear la restricción única.');
    }

    if (await indexExists('uq_codigo_paquete')) {
      await pool.query('DROP INDEX uq_codigo_paquete ON paquetes');
      console.log('OK índice global uq_codigo_paquete eliminado');
    }
    if (!await indexExists('uq_paquetes_sede_codigo')) {
      await pool.query('CREATE UNIQUE INDEX uq_paquetes_sede_codigo ON paquetes (sede_id, codigo_paquete)');
    }
    if (!await indexExists('idx_paquetes_sede_lote_estado')) {
      await pool.query('CREATE INDEX idx_paquetes_sede_lote_estado ON paquetes (sede_id, lote_importacion, estado)');
    }
    if (!await indexExists('idx_paquetes_sede_updated')) {
      await pool.query('CREATE INDEX idx_paquetes_sede_updated ON paquetes (sede_id, updated_at)');
    }
    if (!await foreignKeyExists('fk_paquetes_sede')) {
      await pool.query(
        `ALTER TABLE paquetes
           ADD CONSTRAINT fk_paquetes_sede FOREIGN KEY (sede_id) REFERENCES sedes(id)
           ON DELETE RESTRICT ON UPDATE CASCADE`,
      );
    }

    const [[packages]] = await pool.query<CountRow[]>('SELECT COUNT(*) AS total FROM paquetes');
    const [sites] = await pool.query<RowDataPacket[]>(
      'SELECT sede_id, COUNT(*) AS paquetes, COUNT(DISTINCT lote_importacion) AS lotes FROM paquetes GROUP BY sede_id ORDER BY sede_id',
    );
    console.log(`Migración SAVAR multi-sede completada: ${Number(packages?.total)} paquetes.`);
    console.table(sites);
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
