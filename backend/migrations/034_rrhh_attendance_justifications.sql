-- Justificaciones posteriores a una tardanza o inasistencia real.

CREATE TABLE IF NOT EXISTS personal_justificaciones_asistencia (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asistencia_id INT UNSIGNED NOT NULL,
  empleado_id INT UNSIGNED NOT NULL,
  tipo_incidencia ENUM('TARDANZA','INASISTENCIA') NOT NULL,
  categoria ENUM('MEDICO','EMERGENCIA_FAMILIAR','TRANSPORTE','OTRO') NOT NULL,
  motivo VARCHAR(500) NOT NULL,
  estado ENUM('PENDIENTE','APROBADA','RECHAZADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
  origen_solicitud ENUM('MOVIL','ADMIN') NOT NULL DEFAULT 'MOVIL',
  revisado_por INT UNSIGNED NULL,
  comentario_revision VARCHAR(500) NULL,
  revisado_en DATETIME NULL,
  cancelado_en DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_justificacion_empleado (empleado_id, created_at),
  KEY idx_personal_justificacion_asistencia (asistencia_id, estado, created_at),
  KEY idx_personal_justificacion_revision (estado, created_at),
  KEY idx_personal_justificacion_revisor (revisado_por),
  CONSTRAINT fk_personal_justificacion_asistencia FOREIGN KEY (asistencia_id)
    REFERENCES personal_asistencias(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_justificacion_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_justificacion_revisor FOREIGN KEY (revisado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_justificacion_asistencia_adjuntos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  justificacion_id BIGINT UNSIGNED NOT NULL,
  storage_key VARCHAR(100) NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  bytes INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_justificacion_adjunto_storage (storage_key),
  UNIQUE KEY uq_personal_justificacion_adjunto_solicitud (justificacion_id),
  CONSTRAINT fk_personal_justificacion_adjunto FOREIGN KEY (justificacion_id)
    REFERENCES personal_justificaciones_asistencia(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
