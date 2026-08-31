-- MariaDB 10.4+. La BD conserva solo la URL relativa; los binarios viven en storage persistente.
ALTER TABLE personal_empleados
  ADD COLUMN IF NOT EXISTS foto VARCHAR(512) NULL AFTER direccion;

ALTER TABLE personal_empleados
  MODIFY COLUMN foto VARCHAR(512) NULL COMMENT 'URL relativa de la foto de perfil administrada por el backend';
