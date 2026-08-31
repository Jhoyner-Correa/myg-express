-- MariaDB 10.4+. Trazabilidad del cierre automatico de asistencia diaria.

CREATE TABLE IF NOT EXISTS personal_cierres_asistencia_diaria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sede_id INT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  personal_programado SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  faltas_generadas_total SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  faltas_generadas_ultima_ejecucion SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  jornadas_incompletas SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  procesado_en DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_cierre_sede_fecha (sede_id, fecha),
  KEY idx_personal_cierre_fecha (fecha, procesado_en),
  CONSTRAINT fk_personal_cierre_sede FOREIGN KEY (sede_id)
    REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
