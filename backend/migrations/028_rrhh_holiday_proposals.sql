-- MariaDB 10.4+. Propuestas de feriados provenientes de fuentes externas.
-- Una propuesta nunca altera la asistencia hasta que un administrador la resuelve.

CREATE TABLE IF NOT EXISTS personal_calendario_propuestas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  proveedor VARCHAR(40) NOT NULL,
  clave_externa VARCHAR(180) NOT NULL,
  pais_codigo CHAR(2) NOT NULL DEFAULT 'PE',
  fecha DATE NOT NULL,
  nombre_local VARCHAR(160) NOT NULL,
  nombre_internacional VARCHAR(160) NULL,
  tipo_fuente VARCHAR(40) NOT NULL DEFAULT 'PUBLIC',
  es_nacional TINYINT(1) NOT NULL DEFAULT 1,
  subdivisiones_json LONGTEXT NULL,
  fuente_url VARCHAR(500) NOT NULL,
  payload_json LONGTEXT NULL,
  estado ENUM('PENDIENTE','APROBADA','DESCARTADA') NOT NULL DEFAULT 'PENDIENTE',
  decision ENUM('NO_LABORABLE','JORNADA_NORMAL','JORNADA_ESPECIAL','DESCARTAR') NULL,
  evento_calendario_id BIGINT UNSIGNED NULL,
  comentario_decision VARCHAR(500) NULL,
  decidido_por INT UNSIGNED NULL,
  decidido_at DATETIME NULL,
  sincronizado_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_cal_prop_fuente (proveedor, clave_externa),
  KEY idx_personal_cal_prop_fecha_estado (fecha, estado),
  KEY idx_personal_cal_prop_evento (evento_calendario_id),
  KEY idx_personal_cal_prop_decisor (decidido_por),
  CONSTRAINT fk_personal_cal_prop_evento FOREIGN KEY (evento_calendario_id)
    REFERENCES personal_calendario_laboral(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_personal_cal_prop_decisor FOREIGN KEY (decidido_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_cal_prop_subdivisiones CHECK (
    subdivisiones_json IS NULL OR JSON_VALID(subdivisiones_json)
  ),
  CONSTRAINT chk_personal_cal_prop_payload CHECK (
    payload_json IS NULL OR JSON_VALID(payload_json)
  ),
  CONSTRAINT chk_personal_cal_prop_resolucion CHECK (
    (estado = 'PENDIENTE' AND decision IS NULL AND decidido_at IS NULL) OR
    (estado <> 'PENDIENTE' AND decision IS NOT NULL AND decidido_at IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
