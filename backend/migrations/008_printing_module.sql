-- Cola persistente para impresion de etiquetas mediante un agente Windows local.

CREATE TABLE IF NOT EXISTS `impresion_agentes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `nombre` varchar(80) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `impresora_nombre` varchar(180) NOT NULL,
  `estado` enum('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  `ultimo_contacto_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_impresion_agente_token` (`token_hash`),
  UNIQUE KEY `uq_impresion_agente_sede_nombre` (`sede_id`,`nombre`),
  KEY `idx_impresion_agente_estado_contacto` (`estado`,`ultimo_contacto_at`),
  CONSTRAINT `fk_impresion_agente_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `impresion_trabajos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `solicitado_por_nombre` varchar(120) NOT NULL,
  `tipo` enum('COMANDA') NOT NULL DEFAULT 'COMANDA',
  `estado` enum('PENDIENTE','PROCESANDO','ENVIADO','ERROR','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  `referencia` varchar(120) NOT NULL,
  `origen_json` longtext NOT NULL,
  `payload_tspl` longtext NOT NULL,
  `numero_comandas` smallint(5) unsigned NOT NULL,
  `numero_etiquetas` smallint(5) unsigned NOT NULL,
  `copias` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `idempotency_key` char(36) NOT NULL,
  `agente_id` int(10) unsigned DEFAULT NULL,
  `reservado_at` datetime DEFAULT NULL,
  `enviado_at` datetime DEFAULT NULL,
  `intentos` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `error_detalle` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_impresion_trabajo_idempotencia` (`creado_por`,`idempotency_key`),
  KEY `idx_impresion_trabajo_cola` (`sede_id`,`estado`,`created_at`),
  KEY `idx_impresion_trabajo_agente` (`agente_id`,`estado`),
  CONSTRAINT `fk_impresion_trabajo_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_impresion_trabajo_usuario` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_impresion_trabajo_agente` FOREIGN KEY (`agente_id`) REFERENCES `impresion_agentes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `chk_impresion_trabajo_origen_json` CHECK (json_valid(`origen_json`)),
  CONSTRAINT `chk_impresion_trabajo_copias` CHECK (`copias` BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `permisos`
  (`codigo`, `modulo`, `accion`, `nombre`, `descripcion`, `estado`)
VALUES
  ('impresion.ver', 'IMPRESION', 'VER', 'Consultar impresion',
   'Consultar el estado de agentes y trabajos de impresion', 'ACTIVO'),
  ('impresion.gestionar', 'IMPRESION', 'GESTIONAR', 'Gestionar impresion',
   'Crear, cancelar y reintentar trabajos de impresion', 'ACTIVO')
ON DUPLICATE KEY UPDATE
  `modulo` = VALUES(`modulo`),
  `accion` = VALUES(`accion`),
  `nombre` = VALUES(`nombre`),
  `descripcion` = VALUES(`descripcion`),
  `estado` = 'ACTIVO';

INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT role.id, permission.id
FROM `roles` role
INNER JOIN `permisos` permission
  ON permission.codigo IN ('impresion.ver', 'impresion.gestionar')
WHERE role.codigo IN (
  'SysAdmin', 'AdminEmpresa', 'GerenteEmpresa', 'SupervisorSede', 'EncargadoOficina'
);
