-- Inasistencia parcial por minutos laborables, con resolución y efecto auditable en pagos.

CREATE TABLE IF NOT EXISTS personal_inasistencias_parciales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asistencia_id INT UNSIGNED NOT NULL,
  empleado_id INT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  horario_version_id BIGINT UNSIGNED NOT NULL,
  huella_calculo CHAR(64) NOT NULL,
  minutos_programados SMALLINT UNSIGNED NOT NULL,
  minutos_laborados_programados SMALLINT UNSIGNED NOT NULL,
  minutos_ausencia_detectados SMALLINT UNSIGNED NOT NULL,
  minutos_justificados SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  minutos_compensados SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  minutos_descontables SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  estado ENUM('PENDIENTE','JUSTIFICADA','DESCONTABLE','COMPENSADA','MIXTA','INVALIDADA') NOT NULL DEFAULT 'PENDIENTE',
  comentario_resolucion VARCHAR(500) DEFAULT NULL,
  resuelto_por INT UNSIGNED DEFAULT NULL,
  resuelto_en DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_inasistencia_parcial_asistencia (asistencia_id),
  KEY idx_personal_inasistencia_parcial_empleado_fecha (empleado_id, fecha),
  KEY idx_personal_inasistencia_parcial_estado_fecha (estado, fecha),
  KEY fk_personal_inasistencia_parcial_horario (horario_version_id),
  KEY fk_personal_inasistencia_parcial_revisor (resuelto_por),
  CONSTRAINT fk_personal_inasistencia_parcial_asistencia FOREIGN KEY (asistencia_id)
    REFERENCES personal_asistencias (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_inasistencia_parcial_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_inasistencia_parcial_horario FOREIGN KEY (horario_version_id)
    REFERENCES personal_horario_versiones (id) ON UPDATE CASCADE,
  CONSTRAINT fk_personal_inasistencia_parcial_revisor FOREIGN KEY (resuelto_por)
    REFERENCES usuarios (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_inasistencia_parcial_minutos CHECK (
    minutos_programados > 0
    AND minutos_laborados_programados <= minutos_programados
    AND minutos_ausencia_detectados = minutos_programados - minutos_laborados_programados
    AND minutos_justificados + minutos_compensados + minutos_descontables <= minutos_ausencia_detectados
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @parciales_pendientes_existe = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'personal_liquidaciones_pago'
    AND COLUMN_NAME = 'inasistencias_parciales_pendientes'
);
SET @parciales_pendientes_ddl = IF(
  @parciales_pendientes_existe = 0,
  'ALTER TABLE personal_liquidaciones_pago ADD COLUMN inasistencias_parciales_pendientes SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER faltas_pendientes',
  'SELECT 1'
);
PREPARE parciales_pendientes_stmt FROM @parciales_pendientes_ddl;
EXECUTE parciales_pendientes_stmt;
DEALLOCATE PREPARE parciales_pendientes_stmt;

SET @minutos_parciales_existe = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'personal_liquidaciones_pago'
    AND COLUMN_NAME = 'minutos_inasistencia_parcial'
);
SET @minutos_parciales_ddl = IF(
  @minutos_parciales_existe = 0,
  'ALTER TABLE personal_liquidaciones_pago ADD COLUMN minutos_inasistencia_parcial INT UNSIGNED NOT NULL DEFAULT 0 AFTER inasistencias_parciales_pendientes',
  'SELECT 1'
);
PREPARE minutos_parciales_stmt FROM @minutos_parciales_ddl;
EXECUTE minutos_parciales_stmt;
DEALLOCATE PREPARE minutos_parciales_stmt;

SET @descuento_parcial_existe = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'personal_liquidaciones_pago'
    AND COLUMN_NAME = 'monto_descuento_inasistencia_parcial'
);
SET @descuento_parcial_ddl = IF(
  @descuento_parcial_existe = 0,
  'ALTER TABLE personal_liquidaciones_pago ADD COLUMN monto_descuento_inasistencia_parcial DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER monto_descuento_faltas',
  'SELECT 1'
);
PREPARE descuento_parcial_stmt FROM @descuento_parcial_ddl;
EXECUTE descuento_parcial_stmt;
DEALLOCATE PREPARE descuento_parcial_stmt;
