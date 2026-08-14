-- MariaDB 10.4+. Contingencia biometrica con selfie privada y revision administrativa.

ALTER TABLE personal_marcaciones
  MODIFY COLUMN verificacion_identidad ENUM(
    'BIOMETRIA_DISPOSITIVO','SELFIE_REVISADA','ADMINISTRATIVA','NO_APLICA'
  ) NOT NULL DEFAULT 'NO_APLICA';

CREATE TABLE IF NOT EXISTS personal_solicitudes_marcacion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id CHAR(36) NOT NULL,
  empleado_id INT UNSIGNED NOT NULL,
  sede_id INT UNSIGNED NOT NULL,
  dispositivo_id INT UNSIGNED NOT NULL,
  tipo_marcacion ENUM('ENTRADA','SALIDA_ALMUERZO','REGRESO','SALIDA') NOT NULL,
  latitud DECIMAL(10,8) NOT NULL,
  longitud DECIMAL(11,8) NOT NULL,
  precision_gps DECIMAL(7,2) NOT NULL,
  distancia_sede_metros DECIMAL(9,2) NOT NULL,
  capturada_en DATETIME NOT NULL,
  codigo_fallo_biometrico VARCHAR(50) NOT NULL,
  selfie_storage_key VARCHAR(255) NOT NULL,
  selfie_sha256 CHAR(64) NOT NULL,
  selfie_mime_type VARCHAR(50) NOT NULL,
  selfie_bytes_size INT UNSIGNED NOT NULL,
  estado ENUM('PENDIENTE','APROBADA','RECHAZADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
  revisado_por INT UNSIGNED NULL,
  comentario_revision VARCHAR(500) NULL,
  revisado_en DATETIME NULL,
  marcacion_id INT UNSIGNED NULL,
  expira_en DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_solicitud_marcacion_request (request_id),
  KEY idx_personal_solicitud_sede_estado_fecha (sede_id, estado, capturada_en),
  KEY idx_personal_solicitud_empleado_fecha (empleado_id, capturada_en),
  KEY idx_personal_solicitud_expiracion (estado, expira_en),
  CONSTRAINT fk_personal_solicitud_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_solicitud_sede FOREIGN KEY (sede_id)
    REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_solicitud_dispositivo FOREIGN KEY (dispositivo_id)
    REFERENCES personal_dispositivos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_solicitud_revisor FOREIGN KEY (revisado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_personal_solicitud_marcacion FOREIGN KEY (marcacion_id)
    REFERENCES personal_marcaciones(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
