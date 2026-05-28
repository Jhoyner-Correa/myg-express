-- Database schema dump for sistema_mensajeria
-- Generated on 2026-05-28T04:26:39.043Z

CREATE DATABASE IF NOT EXISTS `sistema_mensajeria` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sistema_mensajeria`;

SET FOREIGN_KEY_CHECKS = 0;

-- --------------------------------------------------------

-- Table structure for table `avisos_diarios`

DROP TABLE IF EXISTS `avisos_diarios`;
CREATE TABLE `avisos_diarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `lote_id` int(10) unsigned NOT NULL,
  `sede_id` int(10) unsigned NOT NULL,
  `whatsapp_sesion_id` int(10) unsigned DEFAULT NULL,
  `nombre` varchar(120) DEFAULT NULL,
  `telefono` varchar(20) NOT NULL,
  `codigo_paquete` varchar(100) DEFAULT NULL,
  `id_plantilla` int(10) unsigned DEFAULT NULL COMMENT 'Plantilla a usar',
  `mensaje_personalizado` text DEFAULT NULL COMMENT 'Solo si el texto cambia',
  `estado_aviso` enum('pendiente','en_cola','enviado','fallido','sin_whatsapp','cancelado') NOT NULL DEFAULT 'pendiente',
  `whatsapp_message_id` varchar(150) DEFAULT NULL,
  `error_detalle` varchar(500) DEFAULT NULL,
  `intentos` tinyint(4) NOT NULL DEFAULT 0,
  `id_trabajo_cola` varchar(100) DEFAULT NULL COMMENT 'ID del job en BullMQ',
  `fecha_envio` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_avisos_lote` (`lote_id`),
  KEY `idx_avisos_telefono` (`telefono`),
  KEY `idx_avisos_pendientes` (`estado_aviso`,`sede_id`),
  KEY `fk_avisos_sede` (`sede_id`),
  KEY `fk_avisos_sesion` (`whatsapp_sesion_id`),
  KEY `fk_avisos_plantilla` (`id_plantilla`),
  CONSTRAINT `fk_avisos_lote` FOREIGN KEY (`lote_id`) REFERENCES `lotes_carga` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_avisos_plantilla` FOREIGN KEY (`id_plantilla`) REFERENCES `plantillas` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_avisos_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`),
  CONSTRAINT `fk_avisos_sesion` FOREIGN KEY (`whatsapp_sesion_id`) REFERENCES `whatsapp_sesiones` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Table structure for table `lotes_carga`

DROP TABLE IF EXISTS `lotes_carga`;
CREATE TABLE `lotes_carga` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `id_usuario_creador` int(10) unsigned DEFAULT NULL COMMENT 'Usuario que creó la ruta',
  `fecha` date NOT NULL,
  `nombre_lote` varchar(100) NOT NULL,
  `zona` varchar(100) DEFAULT NULL COMMENT 'Ej: La Merced, Satipo Centro',
  `observacion` varchar(255) DEFAULT NULL,
  `estado` enum('borrador','pendiente','procesando','pausado','completado','cancelado') NOT NULL DEFAULT 'borrador',
  `fecha_eliminacion` datetime DEFAULT NULL COMMENT 'Para Soft Delete',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_lotes_sede_fecha` (`sede_id`,`fecha`),
  KEY `idx_lotes_zona` (`zona`),
  KEY `idx_lotes_activos` (`estado`,`fecha_eliminacion`),
  KEY `fk_lotes_usuario_creador` (`id_usuario_creador`),
  CONSTRAINT `fk_lotes_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_lotes_usuario_creador` FOREIGN KEY (`id_usuario_creador`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Table structure for table `mensajes_log`

DROP TABLE IF EXISTS `mensajes_log`;
CREATE TABLE `mensajes_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `lote_id` int(10) unsigned DEFAULT NULL,
  `aviso_id` int(10) unsigned DEFAULT NULL,
  `whatsapp_sesion_id` int(10) unsigned DEFAULT NULL,
  `telefono` varchar(20) NOT NULL,
  `nombre_destinatario` varchar(120) DEFAULT NULL,
  `estado_envio` enum('enviado','fallido','sin_whatsapp','cancelado') NOT NULL,
  `whatsapp_message_id` varchar(150) DEFAULT NULL,
  `error_detalle` varchar(500) DEFAULT NULL,
  `fecha_envio` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_log_lote` (`lote_id`),
  KEY `idx_log_aviso` (`aviso_id`),
  KEY `idx_log_created_at` (`created_at`),
  KEY `idx_log_telefono` (`telefono`),
  KEY `fk_log_sede` (`sede_id`),
  KEY `fk_log_sesion` (`whatsapp_sesion_id`),
  CONSTRAINT `fk_log_aviso` FOREIGN KEY (`aviso_id`) REFERENCES `avisos_diarios` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_log_lote` FOREIGN KEY (`lote_id`) REFERENCES `lotes_carga` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_log_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`),
  CONSTRAINT `fk_log_sesion` FOREIGN KEY (`whatsapp_sesion_id`) REFERENCES `whatsapp_sesiones` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Table structure for table `plantillas`

DROP TABLE IF EXISTS `plantillas`;
CREATE TABLE `plantillas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned DEFAULT NULL,
  `nombre` varchar(100) NOT NULL,
  `contenido` text NOT NULL,
  `imagen_path` varchar(500) DEFAULT NULL COMMENT 'Usar rutas relativas (ej. storage/whatsapp-media/...)',
  `estado` enum('activo','inactivo') DEFAULT 'activo',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_plantillas_sede` (`sede_id`),
  CONSTRAINT `fk_plantillas_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Table structure for table `sedes`

DROP TABLE IF EXISTS `sedes`;
CREATE TABLE `sedes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `direccion` varchar(150) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `estado` enum('activo','inactivo') NOT NULL DEFAULT 'activo',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Table structure for table `usuarios`

DROP TABLE IF EXISTS `usuarios`;
CREATE TABLE `usuarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `usuario` varchar(60) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `rol` varchar(50) NOT NULL DEFAULT 'Encargado de Oficina',
  `es_superadmin` tinyint(1) NOT NULL DEFAULT 0,
  `estado` enum('activo','inactivo') NOT NULL DEFAULT 'activo',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario` (`usuario`),
  KEY `fk_usuarios_sede` (`sede_id`),
  CONSTRAINT `fk_usuarios_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- Table structure for table `whatsapp_sesiones`

DROP TABLE IF EXISTS `whatsapp_sesiones`;
CREATE TABLE `whatsapp_sesiones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `nombre_dispositivo` varchar(100) NOT NULL,
  `numero_whatsapp` varchar(30) DEFAULT NULL,
  `estado` enum('disconnected','initializing','waiting_qr','authenticated','connected','reconnecting','auth_failure','blocked','inactive') DEFAULT 'disconnected',
  `session_key` varchar(150) NOT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `ultima_conexion` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_key` (`session_key`),
  KEY `fk_sesiones_sede` (`sede_id`),
  KEY `idx_sesiones_updated_at` (`updated_at`),
  CONSTRAINT `fk_sesiones_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

-- View structure for view `v_estadisticas_lotes`

DROP VIEW IF EXISTS `v_estadisticas_lotes`;
CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `v_estadisticas_lotes` AS select `l`.`id` AS `id_lote`,`s`.`nombre` AS `sede_nombre`,`u`.`nombre` AS `creador_por`,`l`.`fecha` AS `fecha`,`l`.`nombre_lote` AS `nombre_lote`,`l`.`zona` AS `zona`,`l`.`estado` AS `estado`,`l`.`created_at` AS `fecha_creacion`,count(`a`.`id`) AS `total_avisos`,sum(`a`.`estado_aviso` = 'pendiente') AS `avisos_pendientes`,sum(`a`.`estado_aviso` = 'en_cola') AS `avisos_en_cola`,sum(`a`.`estado_aviso` = 'enviado') AS `avisos_enviados`,sum(`a`.`estado_aviso` = 'fallido') AS `avisos_fallidos`,sum(`a`.`estado_aviso` = 'sin_whatsapp') AS `avisos_sin_whatsapp`,sum(`a`.`estado_aviso` = 'cancelado') AS `avisos_cancelados`,ifnull(round(sum(`a`.`estado_aviso` = 'enviado') * 100.0 / nullif(count(`a`.`id`),0),1),0) AS `porcentaje_exito` from (((`lotes_carga` `l` left join `sedes` `s` on(`s`.`id` = `l`.`sede_id`)) left join `usuarios` `u` on(`u`.`id` = `l`.`id_usuario_creador`)) left join `avisos_diarios` `a` on(`a`.`lote_id` = `l`.`id`)) where `l`.`fecha_eliminacion` is null group by `l`.`id`;

SET FOREIGN_KEY_CHECKS = 1;
