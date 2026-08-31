-- MariaDB 10.4+. Horarios versionados y asignaciones con vigencia.

ALTER TABLE personal_horarios
  ADD COLUMN IF NOT EXISTS estado ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO' AFTER tolerancia_minutos,
  ADD COLUMN IF NOT EXISTS creado_por INT UNSIGNED NULL AFTER estado;

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_horarios_nombre ON personal_horarios (nombre);

CREATE TABLE IF NOT EXISTS personal_horario_versiones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  horario_id INT UNSIGNED NOT NULL,
  numero_version INT UNSIGNED NOT NULL,
  hora_entrada TIME NOT NULL,
  hora_salida TIME NOT NULL,
  tolerancia_entrada_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  almuerzo_habilitado TINYINT(1) NOT NULL DEFAULT 1,
  salida_almuerzo_desde TIME NULL,
  salida_almuerzo_hasta TIME NULL,
  duracion_almuerzo_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  tolerancia_retorno_minutos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE NULL,
  creado_por INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_horario_version (horario_id, numero_version),
  UNIQUE KEY uq_personal_horario_vigencia (horario_id, vigente_desde),
  KEY idx_personal_horario_version_periodo (horario_id, vigente_desde, vigente_hasta),
  CONSTRAINT fk_personal_horario_version_horario FOREIGN KEY (horario_id)
    REFERENCES personal_horarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_horario_version_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_horario_version_periodo CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT chk_personal_horario_version_tolerancias CHECK (
    tolerancia_entrada_minutos <= 180 AND tolerancia_retorno_minutos <= 120
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO personal_horario_versiones (
  horario_id, numero_version, hora_entrada, hora_salida,
  tolerancia_entrada_minutos, almuerzo_habilitado,
  salida_almuerzo_desde, salida_almuerzo_hasta,
  duracion_almuerzo_minutos, tolerancia_retorno_minutos,
  vigente_desde, vigente_hasta, creado_por
)
SELECT schedule.id, 1, schedule.hora_entrada, schedule.hora_salida,
       schedule.tolerancia_minutos, 0,
       NULL, NULL,
       0, 0, '2000-01-01', NULL, schedule.creado_por
FROM personal_horarios schedule
WHERE NOT EXISTS (
  SELECT 1 FROM personal_horario_versiones version WHERE version.horario_id = schedule.id
);

ALTER TABLE personal_empleado_horarios
  ADD COLUMN IF NOT EXISTS vigente_desde DATE NOT NULL DEFAULT '2000-01-01' AFTER dia_semana,
  ADD COLUMN IF NOT EXISTS vigente_hasta DATE NULL AFTER vigente_desde,
  ADD COLUMN IF NOT EXISTS creado_por INT UNSIGNED NULL AFTER vigente_hasta,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

CREATE INDEX IF NOT EXISTS idx_personal_emp_hor_employee
  ON personal_empleado_horarios (empleado_id);
DROP INDEX IF EXISTS idx_personal_emp_hor_dia ON personal_empleado_horarios;
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_emp_hor_vigencia
  ON personal_empleado_horarios (empleado_id, dia_semana, vigente_desde);
CREATE INDEX IF NOT EXISTS idx_personal_emp_hor_periodo
  ON personal_empleado_horarios (empleado_id, dia_semana, vigente_desde, vigente_hasta);

ALTER TABLE personal_asistencias
  ADD COLUMN IF NOT EXISTS horario_version_id BIGINT UNSIGNED NULL AFTER fecha;
CREATE INDEX IF NOT EXISTS idx_personal_asist_horario_version
  ON personal_asistencias (horario_version_id);

ALTER TABLE personal_horarios
  ADD CONSTRAINT fk_personal_horario_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE personal_empleado_horarios
  ADD CONSTRAINT fk_personal_emp_hor_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE personal_asistencias
  ADD CONSTRAINT fk_personal_asist_horario_version FOREIGN KEY (horario_version_id)
    REFERENCES personal_horario_versiones(id) ON DELETE SET NULL ON UPDATE CASCADE;
