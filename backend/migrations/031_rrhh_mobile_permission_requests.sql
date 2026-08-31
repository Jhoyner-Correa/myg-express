-- Solicitudes de permisos originadas desde la aplicacion movil y sus sustentos privados.

ALTER TABLE personal_solicitudes_permisos
  ADD COLUMN IF NOT EXISTS origen_solicitud ENUM('ADMIN','MOVIL') NOT NULL DEFAULT 'ADMIN' AFTER motivo;

CREATE TABLE IF NOT EXISTS personal_solicitud_permiso_adjuntos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  solicitud_id INT UNSIGNED NOT NULL,
  storage_key VARCHAR(100) NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  bytes INT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_permiso_adjunto_storage (storage_key),
  UNIQUE KEY uq_personal_permiso_adjunto_solicitud (solicitud_id),
  CONSTRAINT fk_personal_permiso_adjunto_solicitud FOREIGN KEY (solicitud_id)
    REFERENCES personal_solicitudes_permisos(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
