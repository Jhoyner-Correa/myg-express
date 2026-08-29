-- MariaDB 10.4+. Declaracion y sustento privado de sobretiempo por segmento.

ALTER TABLE personal_sobretiempo_solicitudes
  DROP FOREIGN KEY IF EXISTS fk_personal_sobretiempo_marcacion;

ALTER TABLE personal_sobretiempo_solicitudes
  MODIFY COLUMN marcacion_id INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS origen ENUM('DETECCION_AUTOMATICA','DECLARACION_EMPLEADO')
    NOT NULL DEFAULT 'DETECCION_AUTOMATICA' AFTER tipo_evento,
  ADD COLUMN IF NOT EXISTS comentario_empleado VARCHAR(500) NULL AFTER umbral_aplicado_minutos,
  ADD COLUMN IF NOT EXISTS sustento_storage_key VARCHAR(120) NULL AFTER comentario_empleado,
  ADD COLUMN IF NOT EXISTS sustento_nombre VARCHAR(255) NULL AFTER sustento_storage_key,
  ADD COLUMN IF NOT EXISTS sustento_mime VARCHAR(80) NULL AFTER sustento_nombre,
  ADD COLUMN IF NOT EXISTS sustento_bytes INT UNSIGNED NULL AFTER sustento_mime,
  ADD COLUMN IF NOT EXISTS sustento_sha256 CHAR(64) NULL AFTER sustento_bytes,
  ADD COLUMN IF NOT EXISTS declarado_en DATETIME NULL AFTER sustento_sha256;

ALTER TABLE personal_sobretiempo_solicitudes
  ADD CONSTRAINT fk_personal_sobretiempo_marcacion FOREIGN KEY (marcacion_id)
    REFERENCES personal_marcaciones(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_sobretiempo_segmento
  ON personal_sobretiempo_solicitudes (asistencia_id, tipo_evento);

CREATE INDEX IF NOT EXISTS idx_personal_sobretiempo_sustento
  ON personal_sobretiempo_solicitudes (sustento_storage_key);
