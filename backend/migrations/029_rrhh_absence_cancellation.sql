-- MariaDB 10.4+. Cancelacion auditable de permisos y vacaciones.

ALTER TABLE personal_solicitudes_permisos
  MODIFY COLUMN estado ENUM('PENDIENTE','APROBADO','RECHAZADO','CANCELADO')
    NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN IF NOT EXISTS cancelado_por INT UNSIGNED NULL AFTER resuelto_en,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion VARCHAR(500) NULL AFTER cancelado_por,
  ADD COLUMN IF NOT EXISTS cancelado_en DATETIME NULL AFTER motivo_cancelacion;

ALTER TABLE personal_vacaciones
  ADD COLUMN IF NOT EXISTS cancelado_por INT UNSIGNED NULL AFTER revisado_en,
  ADD COLUMN IF NOT EXISTS motivo_cancelacion VARCHAR(500) NULL AFTER cancelado_por,
  ADD COLUMN IF NOT EXISTS cancelado_en DATETIME NULL AFTER motivo_cancelacion;

CREATE INDEX IF NOT EXISTS idx_personal_permisos_cancelado_por
  ON personal_solicitudes_permisos (cancelado_por);

CREATE INDEX IF NOT EXISTS idx_personal_vacaciones_cancelado_por
  ON personal_vacaciones (cancelado_por);
