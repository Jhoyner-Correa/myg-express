-- MariaDB 10.4+. Flujos administrativos de permisos, vacaciones y correcciones auditadas.

ALTER TABLE personal_solicitudes_permisos
  ADD COLUMN IF NOT EXISTS comentario_resolucion VARCHAR(500) NULL AFTER aprobado_por,
  ADD COLUMN IF NOT EXISTS resuelto_en DATETIME NULL AFTER comentario_resolucion;

ALTER TABLE personal_vacaciones
  MODIFY COLUMN estado ENUM(
    'SOLICITADA','APROBADA','RECHAZADA','PROGRAMADA','EN_CURSO','COMPLETADA','CANCELADA'
  ) NOT NULL DEFAULT 'SOLICITADA',
  ADD COLUMN IF NOT EXISTS motivo VARCHAR(500) NULL AFTER dias_tomados,
  ADD COLUMN IF NOT EXISTS revisado_por INT UNSIGNED NULL AFTER estado,
  ADD COLUMN IF NOT EXISTS comentario_revision VARCHAR(500) NULL AFTER revisado_por,
  ADD COLUMN IF NOT EXISTS revisado_en DATETIME NULL AFTER comentario_revision;

ALTER TABLE personal_marcaciones
  MODIFY COLUMN origen_marcacion ENUM('GPS','QR','NFC','BIOMETRICO','ADMINISTRATIVO') NOT NULL DEFAULT 'GPS';

CREATE TABLE IF NOT EXISTS personal_correcciones_asistencia (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asistencia_id INT UNSIGNED NOT NULL,
  empleado_id INT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  motivo VARCHAR(500) NOT NULL,
  valores_anteriores_json LONGTEXT NOT NULL,
  valores_nuevos_json LONGTEXT NOT NULL,
  corregido_por INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_correccion_empleado_fecha (empleado_id, fecha, created_at),
  KEY idx_personal_correccion_asistencia (asistencia_id),
  KEY idx_personal_correccion_usuario (corregido_por),
  CONSTRAINT fk_personal_correccion_asistencia FOREIGN KEY (asistencia_id)
    REFERENCES personal_asistencias(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_correccion_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_correccion_usuario FOREIGN KEY (corregido_por)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_personal_permisos_estado_fecha
  ON personal_solicitudes_permisos (estado, fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_personal_vacaciones_estado_fecha
  ON personal_vacaciones (estado, fecha_inicio, fecha_fin);

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_personal_vacaciones_revisado_por') = 0,
  'ALTER TABLE personal_vacaciones ADD CONSTRAINT fk_personal_vacaciones_revisado_por FOREIGN KEY (revisado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
