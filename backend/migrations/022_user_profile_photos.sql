-- MariaDB 10.4+. La BD conserva la URL relativa; la imagen vive en storage persistente.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS foto VARCHAR(512) NULL AFTER usuario;

ALTER TABLE usuarios
  MODIFY COLUMN foto VARCHAR(512) NULL COMMENT 'URL relativa de la foto de perfil administrada por el backend';
