-- ============================================================
-- Migración 020: Módulo J&T Express (Importación PDF y WhatsApp)
-- ============================================================

CREATE TABLE IF NOT EXISTS `jnt_lotes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `nombre_archivo` varchar(255) NOT NULL,
  `total_paginas` int(11) NOT NULL DEFAULT 0,
  `total_paquetes` int(11) NOT NULL DEFAULT 0,
  `total_consignados` int(11) NOT NULL DEFAULT 0,
  `lote_carga_id` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_jnt_lotes_sede` (`sede_id`, `created_at`),
  KEY `fk_jnt_lotes_usuario` (`usuario_id`),
  KEY `fk_jnt_lotes_lote_carga` (`lote_carga_id`),
  CONSTRAINT `fk_jnt_lotes_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_jnt_lotes_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_jnt_lotes_lote_carga` FOREIGN KEY (`lote_carga_id`) REFERENCES `lotes_carga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `jnt_paquetes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `lote_jnt_id` int(10) unsigned NOT NULL,
  `sede_id` int(10) unsigned NOT NULL,
  `pagina` int(11) NOT NULL,
  `guia` varchar(40) NOT NULL,
  `consignado` varchar(255) NOT NULL,
  `telefono` varchar(20) NOT NULL,
  `distrito` varchar(100) DEFAULT NULL,
  `provincia` varchar(100) DEFAULT NULL,
  `departamento` varchar(100) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `codigo_ruta` varchar(50) DEFAULT NULL,
  `codigo_postal` varchar(20) DEFAULT NULL,
  `peso_kg` decimal(8,3) DEFAULT NULL,
  `contenido` varchar(255) DEFAULT NULL,
  `piezas` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_jnt_paq_lote` (`lote_jnt_id`),
  KEY `idx_jnt_paq_sede_guia` (`sede_id`, `guia`),
  KEY `idx_jnt_paq_telefono` (`telefono`),
  KEY `idx_jnt_paq_distrito` (`distrito`),
  CONSTRAINT `fk_jnt_paq_lote` FOREIGN KEY (`lote_jnt_id`) REFERENCES `jnt_lotes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_jnt_paq_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
