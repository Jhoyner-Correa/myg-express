-- Migración 017: Módulo de Gestión de Fotografías de Guías Urbano
-- Tablas para indexación de identificadores de manifiesto (man_id_det) e historial de operaciones

CREATE TABLE IF NOT EXISTS urbano_guias_man_id_det (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guia VARCHAR(50) NOT NULL,
  gui_numero VARCHAR(50) NULL,
  man_id_det VARCHAR(30) NOT NULL,
  route_id VARCHAR(30) NULL,
  sede_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_urbano_guia (guia),
  INDEX idx_urbano_gui_numero (gui_numero),
  INDEX idx_urbano_man_id_det (man_id_det),
  INDEX idx_urbano_route_id (route_id),
  INDEX idx_urbano_sede_id (sede_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS urbano_fotos_historial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  sede_id INT UNSIGNED NULL,
  guia VARCHAR(50) NOT NULL,
  man_id_det VARCHAR(30) NULL,
  tipo_operacion ENUM('CONSULTA', 'SUBIDA', 'ELIMINACION') NOT NULL,
  img_id VARCHAR(50) NULL,
  resultado ENUM('EXITOSO', 'ERROR') NOT NULL,
  mensaje TEXT NULL,
  detalles_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_fotos_hist_guia (guia),
  INDEX idx_fotos_hist_usuario (usuario_id),
  INDEX idx_fotos_hist_operacion (tipo_operacion),
  INDEX idx_fotos_hist_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relaciones de manifiesto confirmadas para pruebas y resolución inmediata
INSERT INTO urbano_guias_man_id_det (guia, gui_numero, man_id_det, route_id)
VALUES
  ('WYB477212514', '47721251', '44383496', '1164838'),
  ('WYB478229399', '47822939', '44383485', '1164838')
ON DUPLICATE KEY UPDATE
  gui_numero = VALUES(gui_numero),
  man_id_det = VALUES(man_id_det),
  route_id = VALUES(route_id);
