-- Preferencias visuales del usuario. No modifican roles ni permisos de seguridad.

CREATE TABLE IF NOT EXISTS usuario_preferencias_ui (
  usuario_id INT UNSIGNED NOT NULL,
  modulos_sidebar LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id),
  CONSTRAINT fk_usuario_preferencias_ui_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_usuario_preferencias_ui_modulos
    CHECK (modulos_sidebar IS NULL OR JSON_VALID(modulos_sidebar))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- La cuenta principal inicia con una navegación limpia: solo Panel central.
-- Sus permisos del rol permanecen intactos y los módulos pueden volver a mostrarse.
INSERT INTO usuario_preferencias_ui (usuario_id, modulos_sidebar)
SELECT id, JSON_ARRAY('admin.panel.ver')
FROM usuarios
WHERE tipo_usuario = 'SISTEMA'
ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id);

-- Corrige personalizaciones antiguas que confundían visibilidad con autorización.
DELETE user_permission
FROM usuario_permisos user_permission
INNER JOIN usuarios user ON user.id = user_permission.usuario_id
INNER JOIN permisos permission ON permission.id = user_permission.permiso_id
WHERE user.tipo_usuario = 'SISTEMA'
  AND permission.codigo IN (
    'admin.panel.ver', 'rutas.ver', 'whatsapp.ver', 'urbano.rutas.ver',
    'entregas.ver', 'etiquetas.ver', 'savarscan.ver', 'rrhh.ver', 'gps.ver'
  );
