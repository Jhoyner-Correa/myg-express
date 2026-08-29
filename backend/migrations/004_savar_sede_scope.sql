lo de personal el d-- Aislamiento multi-sede de SAVAR SCAN para MariaDB 10.4+.
-- Ejecutar 003 primero. Si reporta lotes ambiguos, no aplicar hasta asignarlos manualmente.
-- La migración es reejecutable y conserva los registros existentes.

ALTER TABLE paquetes
  ADD COLUMN IF NOT EXISTS sede_id INT(10) UNSIGNED NULL AFTER id;

DELIMITER $$
DROP PROCEDURE IF EXISTS assert_savar_lotes_not_shared$$
CREATE PROCEDURE assert_savar_lotes_not_shared()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM paquetes
    WHERE sede_id IS NULL
    GROUP BY lote_importacion
    HAVING COUNT(DISTINCT sede_id_escaneo) > 1
    LIMIT 1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'SAVAR SCAN: hay lotes operados por varias sedes. Ejecute 003 y decida su distribución antes de aplicar 004.';
  END IF;
END$$
DELIMITER ;

CALL assert_savar_lotes_not_shared();
DROP PROCEDURE assert_savar_lotes_not_shared;

-- 1. Una recepción existente identifica inequívocamente la sede del paquete.
UPDATE paquetes
SET sede_id = sede_id_escaneo
WHERE sede_id IS NULL
  AND sede_id_escaneo IS NOT NULL;

-- 2. Los pendientes heredan la sede cuando todo el lote fue operado por una sola sede.
UPDATE paquetes p
JOIN (
  SELECT lote_importacion, MIN(sede_id_escaneo) AS sede_id
  FROM paquetes
  WHERE sede_id_escaneo IS NOT NULL
  GROUP BY lote_importacion
  HAVING COUNT(DISTINCT sede_id_escaneo) = 1
) inferred ON inferred.lote_importacion = p.lote_importacion
SET p.sede_id = inferred.sede_id
WHERE p.sede_id IS NULL;

-- 3. En instalaciones con una sola sede activa, esa sede es el propietario histórico.
UPDATE paquetes p
JOIN (
  SELECT MIN(id) AS sede_id
  FROM sedes
  WHERE estado = 'activo'
  HAVING COUNT(*) = 1
) single_sede
SET p.sede_id = single_sede.sede_id
WHERE p.sede_id IS NULL;

DELIMITER $$
DROP PROCEDURE IF EXISTS assert_savar_sede_backfill_complete$$
CREATE PROCEDURE assert_savar_sede_backfill_complete()
BEGIN
  IF EXISTS (SELECT 1 FROM paquetes WHERE sede_id IS NULL LIMIT 1) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'SAVAR SCAN: existen paquetes sin sede. Revise 003 y asigne sede_id antes de reintentar 004.';
  END IF;
END$$
DELIMITER ;

CALL assert_savar_sede_backfill_complete();
DROP PROCEDURE assert_savar_sede_backfill_complete;

ALTER TABLE paquetes
  MODIFY COLUMN sede_id INT(10) UNSIGNED NOT NULL;

-- La identidad del paquete queda limitada a su sede, no a toda la empresa.
DROP INDEX IF EXISTS uq_codigo_paquete ON paquetes;
CREATE UNIQUE INDEX IF NOT EXISTS uq_paquetes_sede_codigo
  ON paquetes (sede_id, codigo_paquete);
CREATE INDEX IF NOT EXISTS idx_paquetes_sede_lote_estado
  ON paquetes (sede_id, lote_importacion, estado);
CREATE INDEX IF NOT EXISTS idx_paquetes_sede_updated
  ON paquetes (sede_id, updated_at);

DELIMITER $$
DROP PROCEDURE IF EXISTS add_savar_fk_if_missing$$
CREATE PROCEDURE add_savar_fk_if_missing()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_NAME = 'fk_paquetes_sede'
  ) THEN
    ALTER TABLE paquetes
      ADD CONSTRAINT fk_paquetes_sede
      FOREIGN KEY (sede_id) REFERENCES sedes(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$
DELIMITER ;

CALL add_savar_fk_if_missing();
DROP PROCEDURE add_savar_fk_if_missing;
/*  */