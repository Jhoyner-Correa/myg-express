-- MariaDB 10.4+. Historial canónico de la sede laboral del colaborador.
-- La columna personal_empleados.sede_id se conserva como proyección vigente
-- para mantener compatibilidad con los módulos operativos existentes.

CREATE TABLE IF NOT EXISTS personal_empleado_sedes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  sede_id INT UNSIGNED NOT NULL,
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE NULL,
  motivo VARCHAR(255) NULL,
  asignado_por INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  asignacion_abierta_empleado_id INT UNSIGNED
    AS (CASE WHEN vigente_hasta IS NULL THEN empleado_id ELSE NULL END) PERSISTENT,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_empleado_sede_inicio (empleado_id, vigente_desde),
  UNIQUE KEY uq_personal_empleado_sede_abierta (asignacion_abierta_empleado_id),
  KEY idx_personal_empleado_sede_periodo (sede_id, vigente_desde, vigente_hasta),
  KEY idx_personal_empleado_sede_asignador (asignado_por),
  CONSTRAINT fk_personal_empleado_sede_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_empleado_sede_sede FOREIGN KEY (sede_id)
    REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_empleado_sede_asignador FOREIGN KEY (asignado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_empleado_sede_periodo
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO personal_empleado_sedes (
  empleado_id, sede_id, vigente_desde, vigente_hasta, motivo, asignado_por
)
SELECT employee.id,
       employee.sede_id,
       employee.fecha_ingreso,
       CASE
         WHEN employee.estado = 'ACTIVO' THEN NULL
         ELSE GREATEST(employee.fecha_ingreso, COALESCE(employee.fecha_cese, CURRENT_DATE))
       END,
       'MIGRACION_DE_SEDE_ACTUAL',
       NULL
  FROM personal_empleados employee
 WHERE NOT EXISTS (
   SELECT 1
     FROM personal_empleado_sedes assignment
    WHERE assignment.empleado_id = employee.id
 );
