-- MariaDB 10.4+. Revision auditable de incidencias y sobretiempo.

ALTER TABLE personal_sobretiempo_solicitudes
  ADD COLUMN IF NOT EXISTS minutos_aprobados SMALLINT UNSIGNED NULL AFTER minutos_detectados;

UPDATE personal_sobretiempo_solicitudes
   SET minutos_aprobados = minutos_detectados
 WHERE estado = 'APROBADO' AND minutos_aprobados IS NULL;

CREATE TABLE IF NOT EXISTS personal_incidencias_asistencia_revisiones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  asistencia_id INT UNSIGNED NULL,
  fecha DATE NOT NULL,
  tipo_incidencia VARCHAR(40) NOT NULL,
  decision ENUM('MANTENER_ESTADO') NOT NULL DEFAULT 'MANTENER_ESTADO',
  comentario VARCHAR(500) NOT NULL,
  revisado_por INT UNSIGNED NOT NULL,
  revisado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_incidencia_revision (empleado_id, fecha, tipo_incidencia),
  KEY idx_personal_incidencia_fecha (fecha, tipo_incidencia),
  KEY idx_personal_incidencia_asistencia (asistencia_id),
  KEY idx_personal_incidencia_revisor (revisado_por),
  CONSTRAINT fk_personal_incidencia_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_incidencia_asistencia FOREIGN KEY (asistencia_id)
    REFERENCES personal_asistencias(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_personal_incidencia_revisor FOREIGN KEY (revisado_por)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
