-- MariaDB 10.4+. Jerarquia semanal: empresa -> sede -> empleado.

CREATE TABLE IF NOT EXISTS personal_horario_asignaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alcance ENUM('EMPRESA','SEDE','EMPLEADO') NOT NULL,
  sede_id INT UNSIGNED NULL,
  empleado_id INT UNSIGNED NULL,
  horario_id INT UNSIGNED NOT NULL,
  dia_semana TINYINT UNSIGNED NOT NULL,
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE NULL,
  creado_por INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_hor_asig_empresa (alcance, dia_semana, vigente_desde, vigente_hasta),
  KEY idx_personal_hor_asig_sede (sede_id, dia_semana, vigente_desde, vigente_hasta),
  KEY idx_personal_hor_asig_empleado (empleado_id, dia_semana, vigente_desde, vigente_hasta),
  KEY idx_personal_hor_asig_horario (horario_id),
  KEY idx_personal_hor_asig_creador (creado_por),
  CONSTRAINT fk_personal_hor_asig_sede FOREIGN KEY (sede_id)
    REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_personal_hor_asig_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_personal_hor_asig_horario FOREIGN KEY (horario_id)
    REFERENCES personal_horarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_hor_asig_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_hor_asig_dia CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT chk_personal_hor_asig_periodo CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT chk_personal_hor_asig_alcance CHECK (
    (alcance = 'EMPRESA' AND sede_id IS NULL AND empleado_id IS NULL) OR
    (alcance = 'SEDE' AND sede_id IS NOT NULL AND empleado_id IS NULL) OR
    (alcance = 'EMPLEADO' AND sede_id IS NULL AND empleado_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO personal_horario_asignaciones (
  alcance, sede_id, empleado_id, horario_id, dia_semana,
  vigente_desde, vigente_hasta, creado_por, created_at, updated_at
)
SELECT 'EMPLEADO', NULL, legacy.empleado_id, legacy.horario_id, legacy.dia_semana,
       legacy.vigente_desde, legacy.vigente_hasta, legacy.creado_por,
       legacy.created_at, legacy.updated_at
FROM personal_empleado_horarios legacy
WHERE NOT EXISTS (
  SELECT 1
  FROM personal_horario_asignaciones current_assignment
  WHERE current_assignment.alcance = 'EMPLEADO'
    AND current_assignment.empleado_id = legacy.empleado_id
    AND current_assignment.dia_semana = legacy.dia_semana
    AND current_assignment.vigente_desde = legacy.vigente_desde
);
