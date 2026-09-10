-- Soporte para marcación flexible: estado de ubicación en marcaciones y asistencias.
-- Permite registrar asistencias fuera del radio de la sede sin bloquear al colaborador,
-- guardando la distancia y etiquetando la condición como FUERA_DE_SEDE.

ALTER TABLE personal_marcaciones
  ADD COLUMN estado_ubicacion ENUM('EN_SEDE', 'FUERA_DE_SEDE') NOT NULL DEFAULT 'EN_SEDE' AFTER distancia_sede_metros,
  ADD INDEX idx_marcaciones_estado_ubicacion (estado_ubicacion);

UPDATE personal_marcaciones
   SET estado_ubicacion = IF(dentro_de_radio = 1, 'EN_SEDE', 'FUERA_DE_SEDE');

ALTER TABLE personal_asistencias
  ADD COLUMN estado_ubicacion ENUM('EN_SEDE', 'FUERA_DE_SEDE') NOT NULL DEFAULT 'EN_SEDE' AFTER tipo_asistencia,
  ADD INDEX idx_asistencias_estado_ubicacion (estado_ubicacion);

UPDATE personal_asistencias attendance
   SET attendance.estado_ubicacion = 'FUERA_DE_SEDE'
 WHERE EXISTS (
   SELECT 1
     FROM personal_marcaciones mark
    WHERE mark.asistencia_id = attendance.id
      AND (mark.dentro_de_radio = 0 OR mark.estado_ubicacion = 'FUERA_DE_SEDE')
 );
