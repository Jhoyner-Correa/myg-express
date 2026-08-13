-- MariaDB 10.4+. Aplicar solo cuando 005 devuelva todos los conteos en cero.
-- Base de identidad movil, idempotencia, evidencia privada y auditoria de RR. HH.

ALTER TABLE personal_configuracion_gps_sedes
  ADD COLUMN IF NOT EXISTS precision_maxima_metros DECIMAL(6,2) NOT NULL DEFAULT 35.00 AFTER radio_permitido_metros;

ALTER TABLE personal_marcaciones
  ADD COLUMN IF NOT EXISTS request_id CHAR(36) NULL AFTER id,
  ADD COLUMN IF NOT EXISTS distancia_sede_metros DECIMAL(9,2) NULL AFTER dentro_de_radio,
  ADD COLUMN IF NOT EXISTS verificacion_identidad ENUM('BIOMETRIA_DISPOSITIVO','ADMINISTRATIVA','NO_APLICA') NOT NULL DEFAULT 'NO_APLICA' AFTER distancia_sede_metros;

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_marcacion_tipo
  ON personal_marcaciones (asistencia_id, tipo_marcacion);
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_marcacion_request
  ON personal_marcaciones (request_id);

ALTER TABLE personal_dispositivos
  ADD COLUMN IF NOT EXISTS clave_publica TEXT NULL AFTER device_id,
  ADD COLUMN IF NOT EXISTS algoritmo_clave VARCHAR(40) NULL AFTER clave_publica,
  ADD COLUMN IF NOT EXISTS biometria_registrada_en DATETIME NULL AFTER algoritmo_clave,
  ADD COLUMN IF NOT EXISTS autorizado_por INT UNSIGNED NULL AFTER estado,
  ADD COLUMN IF NOT EXISTS autorizado_en DATETIME NULL AFTER autorizado_por,
  ADD COLUMN IF NOT EXISTS revocado_por INT UNSIGNED NULL AFTER autorizado_en,
  ADD COLUMN IF NOT EXISTS revocado_en DATETIME NULL AFTER revocado_por,
  ADD COLUMN IF NOT EXISTS motivo_revocacion VARCHAR(255) NULL AFTER revocado_en,
  ADD COLUMN IF NOT EXISTS empleado_autorizado_id INT UNSIGNED
    AS (CASE WHEN estado = 'AUTORIZADO' THEN empleado_id ELSE NULL END) PERSISTENT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_dispositivo_activo_empleado
  ON personal_dispositivos (empleado_autorizado_id);

CREATE TABLE IF NOT EXISTS personal_activaciones_dispositivo (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  codigo_hash CHAR(64) NOT NULL,
  expira_en DATETIME NOT NULL,
  usado_en DATETIME NULL,
  creado_por INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_activacion_hash (codigo_hash),
  KEY idx_personal_activacion_empleado_expira (empleado_id, expira_en),
  CONSTRAINT fk_personal_activacion_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_activacion_usuario FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_sesiones_app (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  dispositivo_id INT UNSIGNED NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL,
  expira_en DATETIME NOT NULL,
  ultimo_uso_en DATETIME NULL,
  revocado_en DATETIME NULL,
  ip_creacion VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_sesion_refresh_hash (refresh_token_hash),
  KEY idx_personal_sesion_empleado_estado (empleado_id, revocado_en, expira_en),
  CONSTRAINT fk_personal_sesion_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_sesion_dispositivo FOREIGN KEY (dispositivo_id)
    REFERENCES personal_dispositivos(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_desafios_marcacion (
  id CHAR(36) NOT NULL,
  empleado_id INT UNSIGNED NOT NULL,
  dispositivo_id INT UNSIGNED NOT NULL,
  tipo_marcacion ENUM('ENTRADA','SALIDA_ALMUERZO','REGRESO','SALIDA') NOT NULL,
  nonce_hash CHAR(64) NOT NULL,
  expira_en DATETIME NOT NULL,
  usado_en DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_desafio_nonce (nonce_hash),
  KEY idx_personal_desafio_expira (dispositivo_id, usado_en, expira_en),
  CONSTRAINT fk_personal_desafio_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_desafio_dispositivo FOREIGN KEY (dispositivo_id)
    REFERENCES personal_dispositivos(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_evidencias_marcacion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  marcacion_id INT UNSIGNED NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  bytes_size INT UNSIGNED NOT NULL,
  capturada_en DATETIME NOT NULL,
  expira_en DATETIME NOT NULL,
  estado ENUM('ACTIVA','ELIMINADA','RETENIDA') NOT NULL DEFAULT 'ACTIVA',
  eliminada_en DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_evidencia_marcacion (marcacion_id),
  KEY idx_personal_evidencia_expiracion (estado, expira_en),
  CONSTRAINT fk_personal_evidencia_marcacion FOREIGN KEY (marcacion_id)
    REFERENCES personal_marcaciones(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_auditoria_eventos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_evento VARCHAR(80) NOT NULL,
  empleado_id INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NULL,
  dispositivo_id INT UNSIGNED NULL,
  exitoso TINYINT(1) NOT NULL,
  codigo_resultado VARCHAR(80) NOT NULL,
  ip_address VARCHAR(45) NULL,
  metadata_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_auditoria_empleado_fecha (empleado_id, created_at),
  KEY idx_personal_auditoria_tipo_fecha (tipo_evento, created_at),
  CONSTRAINT fk_personal_auditoria_evento_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_personal_auditoria_evento_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_personal_auditoria_evento_dispositivo FOREIGN KEY (dispositivo_id)
    REFERENCES personal_dispositivos(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Los tokens legados estaban almacenados en texto plano y dejan de ser fuente de verdad.
UPDATE personal_acceso_app SET token_actual = NULL, refresh_token = NULL
WHERE token_actual IS NOT NULL OR refresh_token IS NOT NULL;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_personal_dispositivo_autorizado_por') = 0,
  'ALTER TABLE personal_dispositivos ADD CONSTRAINT fk_personal_dispositivo_autorizado_por FOREIGN KEY (autorizado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_personal_dispositivo_revocado_por') = 0,
  'ALTER TABLE personal_dispositivos ADD CONSTRAINT fk_personal_dispositivo_revocado_por FOREIGN KEY (revocado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_personal_auditoria_dispositivo') = 0,
  'ALTER TABLE personal_auditoria_accesos ADD CONSTRAINT fk_personal_auditoria_dispositivo FOREIGN KEY (dispositivo_id) REFERENCES personal_dispositivos(id) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
