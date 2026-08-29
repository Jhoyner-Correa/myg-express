-- MariaDB 10.4+. Ventanas contextuales y evidencia temporal de asistencia.

ALTER TABLE personal_horario_versiones
  ADD COLUMN IF NOT EXISTS entrada_habilitar_antes_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 60 AFTER tolerancia_retorno_minutos,
  ADD COLUMN IF NOT EXISTS almuerzo_habilitar_antes_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER entrada_habilitar_antes_minutos,
  ADD COLUMN IF NOT EXISTS regreso_habilitar_antes_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER almuerzo_habilitar_antes_minutos,
  ADD COLUMN IF NOT EXISTS salida_habilitar_antes_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER regreso_habilitar_antes_minutos,
  ADD COLUMN IF NOT EXISTS umbral_sobretiempo_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 10 AFTER salida_habilitar_antes_minutos;

ALTER TABLE personal_marcaciones
  ADD COLUMN IF NOT EXISTS hora_programada TIME NULL AFTER hora_marcacion,
  ADD COLUMN IF NOT EXISTS diferencia_programada_minutos SMALLINT NULL AFTER hora_programada,
  ADD COLUMN IF NOT EXISTS clasificacion_tiempo ENUM(
    'ANTICIPADA','PUNTUAL','TARDANZA','DEMORADA','SALIDA_ANTICIPADA','SOBRETIEMPO_CANDIDATO'
  ) NULL AFTER diferencia_programada_minutos;

ALTER TABLE personal_asistencias
  ADD COLUMN IF NOT EXISTS minutos_tardanza_retorno SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER minutos_tardanza;

CREATE TABLE IF NOT EXISTS personal_sobretiempo_solicitudes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asistencia_id INT UNSIGNED NOT NULL,
  empleado_id INT UNSIGNED NOT NULL,
  marcacion_salida_id INT UNSIGNED NOT NULL,
  minutos_detectados SMALLINT UNSIGNED NOT NULL,
  umbral_aplicado_minutos SMALLINT UNSIGNED NOT NULL,
  estado ENUM('PENDIENTE','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  revisado_por INT UNSIGNED NULL,
  comentario_revision VARCHAR(500) NULL,
  revisado_en DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_sobretiempo_asistencia (asistencia_id),
  KEY idx_personal_sobretiempo_estado_fecha (estado, created_at),
  KEY idx_personal_sobretiempo_empleado_fecha (empleado_id, created_at),
  CONSTRAINT fk_personal_sobretiempo_asistencia FOREIGN KEY (asistencia_id)
    REFERENCES personal_asistencias(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_sobretiempo_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_sobretiempo_marcacion FOREIGN KEY (marcacion_salida_id)
    REFERENCES personal_marcaciones(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_sobretiempo_revisor FOREIGN KEY (revisado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
