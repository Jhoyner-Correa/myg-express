-- Vinculacion segura y administracion remota de conectores USB por sede.

ALTER TABLE `impresion_agentes`
  MODIFY COLUMN `impresora_nombre` varchar(180) DEFAULT NULL,
  ADD COLUMN `equipo_nombre` varchar(120) DEFAULT NULL AFTER `nombre`,
  ADD COLUMN `impresoras_json` longtext DEFAULT NULL AFTER `impresora_nombre`,
  ADD COLUMN `version_conector` varchar(32) DEFAULT NULL AFTER `impresoras_json`,
  ADD COLUMN `vinculado_at` datetime DEFAULT NULL AFTER `version_conector`,
  ADD CONSTRAINT `chk_impresion_agente_impresoras_json`
    CHECK (`impresoras_json` IS NULL OR json_valid(`impresoras_json`));

CREATE TABLE IF NOT EXISTS `impresion_vinculaciones` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `codigo_hash` char(64) NOT NULL,
  `creado_por` int(10) unsigned NOT NULL,
  `expira_at` datetime NOT NULL,
  `usado_at` datetime DEFAULT NULL,
  `agente_id` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_impresion_vinculacion_codigo` (`codigo_hash`),
  KEY `idx_impresion_vinculacion_sede_expira` (`sede_id`,`expira_at`,`usado_at`),
  KEY `idx_impresion_vinculacion_creador` (`creado_por`),
  KEY `idx_impresion_vinculacion_agente` (`agente_id`),
  CONSTRAINT `fk_impresion_vinculacion_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_impresion_vinculacion_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_impresion_vinculacion_agente` FOREIGN KEY (`agente_id`) REFERENCES `impresion_agentes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
