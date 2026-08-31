-- Bandeja persistente de notificaciones para la aplicacion movil de RR. HH.

CREATE TABLE IF NOT EXISTS personal_notificaciones_app (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  tipo VARCHAR(50) NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  mensaje VARCHAR(500) NOT NULL,
  prioridad ENUM('INFO','IMPORTANTE','URGENTE') NOT NULL DEFAULT 'INFO',
  accion ENUM('INICIO','HISTORIAL','PERFIL') NOT NULL DEFAULT 'INICIO',
  referencia_tipo VARCHAR(50) NULL,
  referencia_id BIGINT UNSIGNED NULL,
  clave_deduplicacion VARCHAR(190) NULL,
  leida_en DATETIME NULL,
  expira_en DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_notificacion_clave (empleado_id, clave_deduplicacion),
  KEY idx_personal_notificacion_bandeja (empleado_id, leida_en, created_at),
  KEY idx_personal_notificacion_expira (expira_en),
  CONSTRAINT fk_personal_notificacion_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
