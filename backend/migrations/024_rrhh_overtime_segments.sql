-- MariaDB 10.4+. El sobretiempo se detecta por segmento y siempre requiere revision.

CREATE INDEX IF NOT EXISTS idx_personal_sobretiempo_asistencia
  ON personal_sobretiempo_solicitudes (asistencia_id);

ALTER TABLE personal_sobretiempo_solicitudes
  DROP INDEX IF EXISTS uq_personal_sobretiempo_asistencia,
  CHANGE COLUMN marcacion_salida_id marcacion_id INT UNSIGNED NOT NULL,
  ADD COLUMN IF NOT EXISTS tipo_evento ENUM('ALMUERZO_DIFERIDO','SALIDA_POSTERIOR') NOT NULL AFTER marcacion_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_sobretiempo_marcacion
  ON personal_sobretiempo_solicitudes (marcacion_id);
