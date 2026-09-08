-- Resolución auditable de faltas y su efecto en la liquidación mensual.

ALTER TABLE personal_incidencias_asistencia_revisiones
  MODIFY COLUMN decision ENUM(
    'MANTENER_ESTADO',
    'JUSTIFICAR_INASISTENCIA',
    'CONFIRMAR_FALTA'
  ) NOT NULL DEFAULT 'MANTENER_ESTADO';

SET @faltas_confirmadas_existe = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'personal_liquidaciones_pago'
    AND COLUMN_NAME = 'faltas_confirmadas'
);
SET @faltas_confirmadas_ddl = IF(
  @faltas_confirmadas_existe = 0,
  'ALTER TABLE personal_liquidaciones_pago ADD COLUMN faltas_confirmadas SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER tarifa_hora_extra_aplicada',
  'SELECT 1'
);
PREPARE faltas_confirmadas_stmt FROM @faltas_confirmadas_ddl;
EXECUTE faltas_confirmadas_stmt;
DEALLOCATE PREPARE faltas_confirmadas_stmt;

SET @faltas_pendientes_existe = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'personal_liquidaciones_pago'
    AND COLUMN_NAME = 'faltas_pendientes'
);
SET @faltas_pendientes_ddl = IF(
  @faltas_pendientes_existe = 0,
  'ALTER TABLE personal_liquidaciones_pago ADD COLUMN faltas_pendientes SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER faltas_confirmadas',
  'SELECT 1'
);
PREPARE faltas_pendientes_stmt FROM @faltas_pendientes_ddl;
EXECUTE faltas_pendientes_stmt;
DEALLOCATE PREPARE faltas_pendientes_stmt;

SET @descuento_faltas_existe = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'personal_liquidaciones_pago'
    AND COLUMN_NAME = 'monto_descuento_faltas'
);
SET @descuento_faltas_ddl = IF(
  @descuento_faltas_existe = 0,
  'ALTER TABLE personal_liquidaciones_pago ADD COLUMN monto_descuento_faltas DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER faltas_pendientes',
  'SELECT 1'
);
PREPARE descuento_faltas_stmt FROM @descuento_faltas_ddl;
EXECUTE descuento_faltas_stmt;
DEALLOCATE PREPARE descuento_faltas_stmt;
