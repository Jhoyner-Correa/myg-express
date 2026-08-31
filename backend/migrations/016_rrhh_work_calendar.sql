-- MariaDB 10.4+. Calendario laboral corporativo y excepciones por sede.

CREATE TABLE IF NOT EXISTS personal_calendario_laboral (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alcance ENUM('EMPRESA','SEDE') NOT NULL,
  sede_id INT UNSIGNED NULL,
  nombre VARCHAR(120) NOT NULL,
  tipo ENUM('FERIADO','DIA_NO_LABORABLE','JORNADA_ESPECIAL') NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  horario_id INT UNSIGNED NULL,
  descripcion VARCHAR(500) NULL,
  estado ENUM('ACTIVO','CANCELADO') NOT NULL DEFAULT 'ACTIVO',
  creado_por INT UNSIGNED NULL,
  cancelado_por INT UNSIGNED NULL,
  cancelado_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_calendario_periodo (fecha_inicio, fecha_fin, estado),
  KEY idx_personal_calendario_sede_periodo (sede_id, fecha_inicio, fecha_fin, estado),
  KEY idx_personal_calendario_horario (horario_id),
  KEY idx_personal_calendario_creador (creado_por),
  KEY idx_personal_calendario_cancelador (cancelado_por),
  CONSTRAINT fk_personal_calendario_sede FOREIGN KEY (sede_id)
    REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_personal_calendario_horario FOREIGN KEY (horario_id)
    REFERENCES personal_horarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_personal_calendario_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_personal_calendario_cancelador FOREIGN KEY (cancelado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_calendario_periodo CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT chk_personal_calendario_alcance CHECK (
    (alcance = 'EMPRESA' AND sede_id IS NULL) OR
    (alcance = 'SEDE' AND sede_id IS NOT NULL)
  ),
  CONSTRAINT chk_personal_calendario_horario CHECK (
    (tipo = 'JORNADA_ESPECIAL' AND horario_id IS NOT NULL) OR
    (tipo <> 'JORNADA_ESPECIAL' AND horario_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
