-- MyG Express - esquema inicial consolidado
-- Generado desde el esquema canonico validado el 2026-08-31.
-- Contiene estructura y catalogos tecnicos; no contiene datos operativos.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `auditoria_sistema` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `actor_usuario_id` int(10) unsigned DEFAULT NULL,
  `evento` varchar(80) NOT NULL,
  `entidad_tipo` varchar(60) NOT NULL,
  `entidad_id` varchar(80) DEFAULT NULL,
  `empresa_id` int(10) unsigned DEFAULT NULL,
  `sede_id` int(10) unsigned DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `metadata` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_auditoria_actor_fecha` (`actor_usuario_id`,`created_at`),
  KEY `idx_auditoria_entidad_fecha` (`entidad_tipo`,`entidad_id`,`created_at`),
  KEY `fk_auditoria_empresa` (`empresa_id`),
  KEY `fk_auditoria_sede` (`sede_id`),
  CONSTRAINT `chk_auditoria_metadata_json` CHECK (`metadata` is null or json_valid(`metadata`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `avisos_diarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `lote_id` int(10) unsigned NOT NULL,
  `sede_id` int(10) unsigned NOT NULL,
  `whatsapp_sesion_id` int(10) unsigned DEFAULT NULL,
  `nombre` varchar(120) DEFAULT NULL,
  `telefono` varchar(20) NOT NULL,
  `codigo_paquete` varchar(100) DEFAULT NULL,
  `peso_kg` decimal(8,3) DEFAULT NULL,
  `tipo_paquete_urbano` varchar(80) DEFAULT NULL,
  `piezas` int(10) unsigned DEFAULT NULL,
  `contenido_paquete` varchar(255) DEFAULT NULL,
  `id_plantilla` int(10) unsigned DEFAULT NULL COMMENT 'Plantilla a usar',
  `mensaje_personalizado` text DEFAULT NULL COMMENT 'Solo si el texto cambia',
  `estado_aviso` enum('pendiente','en_cola','enviado','enviado_manual','fallido','sin_whatsapp','cancelado') NOT NULL DEFAULT 'pendiente',
  `estado_entrega` enum('pendiente','recogido') NOT NULL DEFAULT 'pendiente',
  `whatsapp_message_id` varchar(150) DEFAULT NULL,
  `error_detalle` varchar(500) DEFAULT NULL,
  `intentos` tinyint(4) NOT NULL DEFAULT 0,
  `id_trabajo_cola` varchar(100) DEFAULT NULL COMMENT 'ID del job en BullMQ',
  `fecha_envio` datetime DEFAULT NULL,
  `marcado_manual_por` int(10) unsigned DEFAULT NULL COMMENT 'Usuario que registro el cierre manual',
  `fecha_marcado_manual` datetime DEFAULT NULL COMMENT 'Fecha del cierre manual',
  `medio_manual` enum('whatsapp_manual','llamada','otro') DEFAULT NULL COMMENT 'Medio usado para resolver el aviso manualmente',
  `observacion_manual` varchar(255) DEFAULT NULL COMMENT 'Nota opcional del cierre manual',
  `fecha_entrega` datetime DEFAULT NULL,
  `entregado_por` int(10) unsigned DEFAULT NULL,
  `observacion_entrega` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_avisos_job_id` (`id_trabajo_cola`),
  KEY `idx_avisos_lote` (`lote_id`),
  KEY `idx_avisos_telefono` (`telefono`),
  KEY `idx_avisos_pendientes` (`estado_aviso`,`sede_id`),
  KEY `fk_avisos_sesion` (`whatsapp_sesion_id`),
  KEY `fk_avisos_plantilla` (`id_plantilla`),
  KEY `idx_avisos_entrega_sede_estado` (`sede_id`,`estado_entrega`),
  KEY `idx_avisos_busqueda_entrega` (`sede_id`,`telefono`,`codigo_paquete`),
  KEY `idx_avisos_entregado_por` (`entregado_por`),
  KEY `idx_avisos_peso_kg` (`peso_kg`),
  KEY `idx_avisos_tipo_paquete` (`tipo_paquete_urbano`),
  KEY `idx_avisos_manual` (`marcado_manual_por`,`fecha_marcado_manual`),
  KEY `idx_avisos_sede_lote_estado` (`sede_id`,`lote_id`,`estado_aviso`),
  KEY `idx_avisos_sede_estado_created` (`sede_id`,`estado_aviso`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `empresas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `codigo` varchar(40) NOT NULL,
  `razon_social` varchar(160) DEFAULT NULL,
  `ruc` char(11) DEFAULT NULL,
  `nombre_comercial` varchar(120) NOT NULL,
  `zona_horaria` varchar(60) NOT NULL DEFAULT 'America/Lima',
  `estado` enum('ACTIVA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_empresas_codigo` (`codigo`),
  UNIQUE KEY `uq_empresas_ruc` (`ruc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lotes_carga` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `id_usuario_creador` int(10) unsigned DEFAULT NULL COMMENT 'Usuario que creó la ruta',
  `fecha` date NOT NULL,
  `nombre_lote` varchar(100) NOT NULL,
  `zona` varchar(100) DEFAULT NULL COMMENT 'Ej: La Merced, Satipo Centro',
  `estado` enum('borrador','pendiente','procesando','pausado','completado','cancelado') NOT NULL DEFAULT 'borrador',
  `entregas_habilitado` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 cuando la ruta fue enviada manualmente a Gestion de entregas',
  `fecha_habilitado_entregas` datetime DEFAULT NULL COMMENT 'Fecha en que la ruta fue enviada a Gestion de entregas',
  `fecha_eliminacion` datetime DEFAULT NULL COMMENT 'Para Soft Delete',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_lotes_sede_fecha` (`sede_id`,`fecha`),
  KEY `idx_lotes_zona` (`zona`),
  KEY `idx_lotes_activos` (`estado`,`fecha_eliminacion`),
  KEY `fk_lotes_usuario_creador` (`id_usuario_creador`),
  KEY `idx_lotes_entregas` (`sede_id`,`entregas_habilitado`,`fecha_eliminacion`),
  KEY `idx_lotes_sede_activos_fecha` (`sede_id`,`fecha_eliminacion`,`fecha`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mensajes_log` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `lote_id` int(10) unsigned DEFAULT NULL,
  `aviso_id` int(10) unsigned DEFAULT NULL,
  `whatsapp_sesion_id` int(10) unsigned DEFAULT NULL,
  `telefono` varchar(20) NOT NULL,
  `nombre_destinatario` varchar(120) DEFAULT NULL,
  `estado_envio` enum('enviado','enviado_manual','fallido','sin_whatsapp','cancelado') NOT NULL,
  `whatsapp_message_id` varchar(150) DEFAULT NULL,
  `error_detalle` varchar(500) DEFAULT NULL,
  `fecha_envio` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_log_aviso_estado` (`aviso_id`,`estado_envio`),
  KEY `idx_log_lote` (`lote_id`),
  KEY `idx_log_aviso` (`aviso_id`),
  KEY `fk_log_sede` (`sede_id`),
  KEY `fk_log_sesion` (`whatsapp_sesion_id`),
  KEY `idx_log_created_at` (`created_at`),
  KEY `idx_log_telefono` (`telefono`),
  KEY `idx_log_sesion_estado_fecha` (`whatsapp_sesion_id`,`estado_envio`,`created_at`),
  KEY `idx_log_sede_fecha` (`sede_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mobile_app_releases` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `plataforma` enum('ANDROID') NOT NULL DEFAULT 'ANDROID',
  `canal` enum('PRODUCTION','BETA','INTERNAL') NOT NULL DEFAULT 'PRODUCTION',
  `version_name` varchar(32) NOT NULL,
  `build_number` int(10) unsigned NOT NULL,
  `minimum_supported_build` int(10) unsigned NOT NULL,
  `estado` enum('DRAFT','PUBLISHED','RETIRED') NOT NULL DEFAULT 'DRAFT',
  `download_url` varchar(500) DEFAULT NULL,
  `release_notes` text DEFAULT NULL,
  `checksum_sha256` char(64) DEFAULT NULL,
  `publicado_en` datetime DEFAULT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mobile_release_build` (`plataforma`,`canal`,`build_number`),
  KEY `idx_mobile_release_policy` (`plataforma`,`canal`,`estado`,`build_number`),
  KEY `fk_mobile_release_creador` (`creado_por`),
  CONSTRAINT `chk_mobile_release_min_build` CHECK (`minimum_supported_build` <= `build_number`),
  CONSTRAINT `chk_mobile_release_published_at` CHECK (`estado` <> 'PUBLISHED' or `publicado_en` is not null)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `paquetes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `codigo_paquete` varchar(100) NOT NULL,
  `consignado` varchar(255) NOT NULL,
  `direccion` varchar(255) NOT NULL,
  `telefono` varchar(50) DEFAULT NULL,
  `departamento` varchar(100) NOT NULL,
  `provincia` varchar(100) NOT NULL,
  `distrito` varchar(100) NOT NULL,
  `lote_importacion` varchar(120) NOT NULL DEFAULT 'SAVAR-GENERAL',
  `estado` varchar(50) NOT NULL DEFAULT 'PENDIENTE',
  `fecha_escaneo` datetime DEFAULT NULL,
  `usuario_id_escaneo` int(10) unsigned DEFAULT NULL,
  `sede_id_escaneo` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_paquetes_sede_codigo` (`sede_id`,`codigo_paquete`),
  KEY `idx_paquetes_estado` (`estado`),
  KEY `idx_paquetes_escaneo` (`sede_id_escaneo`,`fecha_escaneo`),
  KEY `fk_paquetes_usuario` (`usuario_id_escaneo`),
  KEY `idx_paquetes_lote` (`lote_importacion`,`estado`),
  KEY `idx_paquetes_sede_lote_estado` (`sede_id`,`lote_importacion`,`estado`),
  KEY `idx_paquetes_sede_updated` (`sede_id`,`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `paquetes_auditoria` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `codigo_escaneado` varchar(100) NOT NULL,
  `tipo_incidencia` varchar(50) NOT NULL,
  `usuario_id` int(10) unsigned NOT NULL,
  `sede_id` int(10) unsigned NOT NULL,
  `fecha` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_paquetes_aud_tipo` (`tipo_incidencia`),
  KEY `idx_paquetes_aud_sede_fecha` (`sede_id`,`fecha`),
  KEY `fk_paquetes_aud_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `permisos` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `codigo` varchar(80) NOT NULL,
  `modulo` varchar(40) NOT NULL,
  `accion` varchar(40) NOT NULL,
  `nombre` varchar(120) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `estado` enum('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permisos_codigo` (`codigo`),
  KEY `idx_permisos_modulo_estado` (`modulo`,`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_acceso_app` (
  `empleado_id` int(10) unsigned NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `requiere_cambio_clave` tinyint(1) DEFAULT 1,
  `token_actual` varchar(500) DEFAULT NULL COMMENT 'AccessToken JWT vigente',
  `refresh_token` varchar(500) DEFAULT NULL COMMENT 'RefreshToken móvil',
  `ultimo_login` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`empleado_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_activaciones_dispositivo` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `codigo_hash` char(64) NOT NULL,
  `expira_en` datetime NOT NULL,
  `usado_en` datetime DEFAULT NULL,
  `creado_por` int(10) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_activacion_hash` (`codigo_hash`),
  KEY `idx_personal_activacion_empleado_expira` (`empleado_id`,`expira_en`),
  KEY `fk_personal_activacion_usuario` (`creado_por`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_asistencias` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `fecha` date NOT NULL,
  `horario_version_id` bigint(20) unsigned DEFAULT NULL,
  `estado_asistencia` enum('PRESENTE','TARDANZA','FALTA','PERMISO','VACACIONES') NOT NULL DEFAULT 'PRESENTE',
  `tipo_asistencia` enum('NORMAL','REMOTA','COMISION','VISITA') NOT NULL DEFAULT 'NORMAL',
  `minutos_tardanza` int(10) DEFAULT 0,
  `minutos_tardanza_retorno` smallint(5) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_personal_asist_emp_fecha` (`empleado_id`,`fecha`),
  KEY `idx_personal_asist_fecha` (`fecha`),
  KEY `idx_personal_asist_horario_version` (`horario_version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_auditoria_eventos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tipo_evento` varchar(80) NOT NULL,
  `empleado_id` int(10) unsigned DEFAULT NULL,
  `usuario_id` int(10) unsigned DEFAULT NULL,
  `dispositivo_id` int(10) unsigned DEFAULT NULL,
  `exitoso` tinyint(1) NOT NULL,
  `codigo_resultado` varchar(80) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `metadata_json` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_personal_auditoria_empleado_fecha` (`empleado_id`,`created_at`),
  KEY `idx_personal_auditoria_tipo_fecha` (`tipo_evento`,`created_at`),
  KEY `fk_personal_auditoria_evento_usuario` (`usuario_id`),
  KEY `fk_personal_auditoria_evento_dispositivo` (`dispositivo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_calendario_laboral` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `alcance` enum('EMPRESA','SEDE') NOT NULL,
  `sede_id` int(10) unsigned DEFAULT NULL,
  `nombre` varchar(120) NOT NULL,
  `tipo` enum('FERIADO','DIA_NO_LABORABLE','JORNADA_ESPECIAL') NOT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date NOT NULL,
  `horario_id` int(10) unsigned DEFAULT NULL,
  `descripcion` varchar(500) DEFAULT NULL,
  `estado` enum('ACTIVO','CANCELADO') NOT NULL DEFAULT 'ACTIVO',
  `creado_por` int(10) unsigned DEFAULT NULL,
  `cancelado_por` int(10) unsigned DEFAULT NULL,
  `cancelado_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_personal_calendario_periodo` (`fecha_inicio`,`fecha_fin`,`estado`),
  KEY `idx_personal_calendario_sede_periodo` (`sede_id`,`fecha_inicio`,`fecha_fin`,`estado`),
  KEY `idx_personal_calendario_horario` (`horario_id`),
  KEY `idx_personal_calendario_creador` (`creado_por`),
  KEY `idx_personal_calendario_cancelador` (`cancelado_por`),
  CONSTRAINT `chk_personal_calendario_periodo` CHECK (`fecha_fin` >= `fecha_inicio`),
  CONSTRAINT `chk_personal_calendario_alcance` CHECK (`alcance` = 'EMPRESA' and `sede_id` is null or `alcance` = 'SEDE' and `sede_id` is not null),
  CONSTRAINT `chk_personal_calendario_horario` CHECK (`tipo` = 'JORNADA_ESPECIAL' and `horario_id` is not null or `tipo` <> 'JORNADA_ESPECIAL' and `horario_id` is null)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_calendario_propuestas` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `proveedor` varchar(40) NOT NULL,
  `clave_externa` varchar(180) NOT NULL,
  `pais_codigo` char(2) NOT NULL DEFAULT 'PE',
  `fecha` date NOT NULL,
  `nombre_local` varchar(160) NOT NULL,
  `nombre_internacional` varchar(160) DEFAULT NULL,
  `tipo_fuente` varchar(40) NOT NULL DEFAULT 'PUBLIC',
  `es_nacional` tinyint(1) NOT NULL DEFAULT 1,
  `subdivisiones_json` longtext DEFAULT NULL,
  `fuente_url` varchar(500) NOT NULL,
  `payload_json` longtext DEFAULT NULL,
  `estado` enum('PENDIENTE','APROBADA','DESCARTADA') NOT NULL DEFAULT 'PENDIENTE',
  `decision` enum('NO_LABORABLE','JORNADA_NORMAL','JORNADA_ESPECIAL','DESCARTAR') DEFAULT NULL,
  `evento_calendario_id` bigint(20) unsigned DEFAULT NULL,
  `comentario_decision` varchar(500) DEFAULT NULL,
  `decidido_por` int(10) unsigned DEFAULT NULL,
  `decidido_at` datetime DEFAULT NULL,
  `sincronizado_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_cal_prop_fuente` (`proveedor`,`clave_externa`),
  KEY `idx_personal_cal_prop_fecha_estado` (`fecha`,`estado`),
  KEY `idx_personal_cal_prop_evento` (`evento_calendario_id`),
  KEY `idx_personal_cal_prop_decisor` (`decidido_por`),
  CONSTRAINT `chk_personal_cal_prop_subdivisiones` CHECK (`subdivisiones_json` is null or json_valid(`subdivisiones_json`)),
  CONSTRAINT `chk_personal_cal_prop_payload` CHECK (`payload_json` is null or json_valid(`payload_json`)),
  CONSTRAINT `chk_personal_cal_prop_resolucion` CHECK (`estado` = 'PENDIENTE' and `decision` is null and `decidido_at` is null or `estado` <> 'PENDIENTE' and `decision` is not null and `decidido_at` is not null)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_cargos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `tipo_rastreo_defecto` enum('NINGUNO','SOLO_MARCACION','CONTINUO') NOT NULL DEFAULT 'SOLO_MARCACION',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_cierres_asistencia_diaria` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `fecha` date NOT NULL,
  `personal_programado` smallint(5) unsigned NOT NULL DEFAULT 0,
  `faltas_generadas_total` smallint(5) unsigned NOT NULL DEFAULT 0,
  `faltas_generadas_ultima_ejecucion` smallint(5) unsigned NOT NULL DEFAULT 0,
  `jornadas_incompletas` smallint(5) unsigned NOT NULL DEFAULT 0,
  `procesado_en` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_cierre_sede_fecha` (`sede_id`,`fecha`),
  KEY `idx_personal_cierre_fecha` (`fecha`,`procesado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_codigo_empleado_secuencias` (
  `empresa_id` int(10) unsigned NOT NULL,
  `prefijo` varchar(10) NOT NULL,
  `ultimo_valor` int(10) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`empresa_id`),
  UNIQUE KEY `uq_personal_codigo_empleado_prefijo` (`prefijo`),
  CONSTRAINT `chk_personal_codigo_empleado_valor` CHECK (`ultimo_valor` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_configuracion_gps_sedes` (
  `sede_id` int(10) unsigned NOT NULL,
  `latitud` decimal(10,8) NOT NULL,
  `longitud` decimal(11,8) NOT NULL,
  `radio_permitido_metros` int(10) NOT NULL DEFAULT 50,
  `precision_maxima_metros` decimal(6,2) NOT NULL DEFAULT 35.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`sede_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_correcciones_asistencia` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `asistencia_id` int(10) unsigned NOT NULL,
  `empleado_id` int(10) unsigned NOT NULL,
  `fecha` date NOT NULL,
  `motivo` varchar(500) NOT NULL,
  `valores_anteriores_json` longtext NOT NULL,
  `valores_nuevos_json` longtext NOT NULL,
  `corregido_por` int(10) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_personal_correccion_empleado_fecha` (`empleado_id`,`fecha`,`created_at`),
  KEY `idx_personal_correccion_asistencia` (`asistencia_id`),
  KEY `idx_personal_correccion_usuario` (`corregido_por`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_desafios_marcacion` (
  `id` char(36) NOT NULL,
  `empleado_id` int(10) unsigned NOT NULL,
  `dispositivo_id` int(10) unsigned NOT NULL,
  `tipo_marcacion` enum('ENTRADA','SALIDA_ALMUERZO','REGRESO','SALIDA') NOT NULL,
  `nonce_hash` char(64) NOT NULL,
  `expira_en` datetime NOT NULL,
  `usado_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_desafio_nonce` (`nonce_hash`),
  KEY `idx_personal_desafio_expira` (`dispositivo_id`,`usado_en`,`expira_en`),
  KEY `fk_personal_desafio_empleado` (`empleado_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_dispositivos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `device_id` varchar(255) NOT NULL COMMENT 'UID único del hardware',
  `clave_publica` text DEFAULT NULL,
  `algoritmo_clave` varchar(40) DEFAULT NULL,
  `biometria_registrada_en` datetime DEFAULT NULL,
  `firebase_token` text DEFAULT NULL COMMENT 'Token FCM Push',
  `marca` varchar(100) DEFAULT NULL,
  `modelo` varchar(100) DEFAULT NULL,
  `version_android` varchar(50) DEFAULT NULL,
  `version_app` varchar(50) DEFAULT NULL,
  `estado` enum('AUTORIZADO','BLOQUEADO','PENDIENTE') DEFAULT 'PENDIENTE',
  `autorizado_por` int(10) unsigned DEFAULT NULL,
  `autorizado_en` datetime DEFAULT NULL,
  `revocado_por` int(10) unsigned DEFAULT NULL,
  `revocado_en` datetime DEFAULT NULL,
  `motivo_revocacion` varchar(255) DEFAULT NULL,
  `ultimo_acceso` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `empleado_autorizado_id` int(10) unsigned GENERATED ALWAYS AS (case when `estado` = 'AUTORIZADO' then `empleado_id` else NULL end) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_personal_disp_uid` (`device_id`),
  UNIQUE KEY `uq_personal_dispositivo_activo_empleado` (`empleado_autorizado_id`),
  KEY `idx_personal_disp_empleado` (`empleado_id`),
  KEY `fk_personal_dispositivo_autorizado_por` (`autorizado_por`),
  KEY `fk_personal_dispositivo_revocado_por` (`revocado_por`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_empleados` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `codigo_empleado` varchar(20) NOT NULL,
  `sede_id` int(10) unsigned NOT NULL COMMENT 'Relación directa con tabla logística sedes',
  `cargo_id` int(10) unsigned NOT NULL,
  `dni` varchar(15) NOT NULL,
  `ruc` varchar(11) DEFAULT NULL,
  `nombres` varchar(100) NOT NULL,
  `apellidos` varchar(100) NOT NULL,
  `sexo` enum('M','F') NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `foto` varchar(512) DEFAULT NULL COMMENT 'URL relativa de la foto de perfil administrada por el backend',
  `fecha_ingreso` date NOT NULL,
  `fecha_cese` date DEFAULT NULL,
  `tipo_rastreo` enum('NINGUNO','SOLO_MARCACION','CONTINUO') NOT NULL DEFAULT 'SOLO_MARCACION' COMMENT 'Sobrescribe rastreo del cargo',
  `estado` enum('ACTIVO','INACTIVO','SUSPENDIDO') DEFAULT 'ACTIVO',
  `observaciones` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_personal_emp_codigo` (`codigo_empleado`),
  UNIQUE KEY `idx_personal_emp_dni` (`dni`),
  UNIQUE KEY `uq_personal_empleados_ruc` (`ruc`),
  KEY `idx_personal_emp_sede` (`sede_id`),
  KEY `idx_personal_emp_fecha_ing` (`fecha_ingreso`),
  KEY `fk_personal_emp_cargo` (`cargo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_empleado_sedes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `sede_id` int(10) unsigned NOT NULL,
  `vigente_desde` date NOT NULL,
  `vigente_hasta` date DEFAULT NULL,
  `motivo` varchar(255) DEFAULT NULL,
  `asignado_por` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `asignacion_abierta_empleado_id` int(10) unsigned GENERATED ALWAYS AS (case when `vigente_hasta` is null then `empleado_id` else NULL end) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_empleado_sede_inicio` (`empleado_id`,`vigente_desde`),
  UNIQUE KEY `uq_personal_empleado_sede_abierta` (`asignacion_abierta_empleado_id`),
  KEY `idx_personal_empleado_sede_periodo` (`sede_id`,`vigente_desde`,`vigente_hasta`),
  KEY `idx_personal_empleado_sede_asignador` (`asignado_por`),
  CONSTRAINT `chk_personal_empleado_sede_periodo` CHECK (`vigente_hasta` is null or `vigente_hasta` >= `vigente_desde`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_evidencias_marcacion` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `marcacion_id` int(10) unsigned NOT NULL,
  `storage_key` varchar(500) NOT NULL,
  `sha256` char(64) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `bytes_size` int(10) unsigned NOT NULL,
  `capturada_en` datetime NOT NULL,
  `expira_en` datetime NOT NULL,
  `estado` enum('ACTIVA','ELIMINADA','RETENIDA') NOT NULL DEFAULT 'ACTIVA',
  `eliminada_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_evidencia_marcacion` (`marcacion_id`),
  KEY `idx_personal_evidencia_expiracion` (`estado`,`expira_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_gps_historial` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `latitud` decimal(10,8) NOT NULL,
  `longitud` decimal(11,8) NOT NULL,
  `velocidad_kmh` decimal(5,2) DEFAULT 0.00,
  `precision_gps` decimal(6,2) DEFAULT NULL,
  `altitud` decimal(7,2) DEFAULT NULL,
  `rumbo` decimal(5,2) DEFAULT NULL,
  `estado_movimiento` enum('DETENIDO','CAMINANDO','VEHICULO') DEFAULT 'DETENIDO',
  `porcentaje_bateria` tinyint(4) DEFAULT NULL,
  `registrado_en` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_personal_gps_hist_emp_fecha` (`empleado_id`,`registrado_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_gps_tiempo_real` (
  `empleado_id` int(10) unsigned NOT NULL,
  `latitud` decimal(10,8) NOT NULL,
  `longitud` decimal(11,8) NOT NULL,
  `velocidad_kmh` decimal(5,2) DEFAULT 0.00,
  `precision_gps` decimal(6,2) DEFAULT NULL,
  `altitud` decimal(7,2) DEFAULT NULL,
  `rumbo` decimal(5,2) DEFAULT NULL,
  `estado_movimiento` enum('DETENIDO','CAMINANDO','VEHICULO') DEFAULT 'DETENIDO',
  `porcentaje_bateria` tinyint(4) DEFAULT NULL,
  `ultima_actualizacion` datetime NOT NULL,
  PRIMARY KEY (`empleado_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_horarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `hora_entrada` time NOT NULL,
  `hora_salida` time NOT NULL,
  `tolerancia_minutos` int(10) NOT NULL DEFAULT 0,
  `estado` enum('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  `creado_por` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_horarios_nombre` (`nombre`),
  KEY `fk_personal_horario_creador` (`creado_por`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_horario_asignaciones` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `alcance` enum('EMPRESA','SEDE','EMPLEADO') NOT NULL,
  `sede_id` int(10) unsigned DEFAULT NULL,
  `empleado_id` int(10) unsigned DEFAULT NULL,
  `horario_id` int(10) unsigned NOT NULL,
  `dia_semana` tinyint(3) unsigned NOT NULL,
  `vigente_desde` date NOT NULL,
  `vigente_hasta` date DEFAULT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_personal_hor_asig_empresa` (`alcance`,`dia_semana`,`vigente_desde`,`vigente_hasta`),
  KEY `idx_personal_hor_asig_sede` (`sede_id`,`dia_semana`,`vigente_desde`,`vigente_hasta`),
  KEY `idx_personal_hor_asig_empleado` (`empleado_id`,`dia_semana`,`vigente_desde`,`vigente_hasta`),
  KEY `idx_personal_hor_asig_horario` (`horario_id`),
  KEY `idx_personal_hor_asig_creador` (`creado_por`),
  CONSTRAINT `chk_personal_hor_asig_dia` CHECK (`dia_semana` between 1 and 7),
  CONSTRAINT `chk_personal_hor_asig_periodo` CHECK (`vigente_hasta` is null or `vigente_hasta` >= `vigente_desde`),
  CONSTRAINT `chk_personal_hor_asig_alcance` CHECK (`alcance` = 'EMPRESA' and `sede_id` is null and `empleado_id` is null or `alcance` = 'SEDE' and `sede_id` is not null and `empleado_id` is null or `alcance` = 'EMPLEADO' and `sede_id` is null and `empleado_id` is not null)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_horario_versiones` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `horario_id` int(10) unsigned NOT NULL,
  `numero_version` int(10) unsigned NOT NULL,
  `hora_entrada` time NOT NULL,
  `hora_salida` time NOT NULL,
  `tolerancia_entrada_minutos` smallint(5) unsigned NOT NULL DEFAULT 0,
  `almuerzo_habilitado` tinyint(1) NOT NULL DEFAULT 1,
  `salida_almuerzo_desde` time DEFAULT NULL,
  `salida_almuerzo_hasta` time DEFAULT NULL,
  `duracion_almuerzo_minutos` smallint(5) unsigned NOT NULL DEFAULT 60,
  `tolerancia_retorno_minutos` smallint(5) unsigned NOT NULL DEFAULT 0,
  `entrada_habilitar_antes_minutos` smallint(5) unsigned NOT NULL DEFAULT 60,
  `almuerzo_habilitar_antes_minutos` smallint(5) unsigned NOT NULL DEFAULT 30,
  `regreso_habilitar_antes_minutos` smallint(5) unsigned NOT NULL DEFAULT 30,
  `salida_habilitar_antes_minutos` smallint(5) unsigned NOT NULL DEFAULT 30,
  `umbral_sobretiempo_minutos` smallint(5) unsigned NOT NULL DEFAULT 10,
  `vigente_desde` date NOT NULL,
  `vigente_hasta` date DEFAULT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_horario_version` (`horario_id`,`numero_version`),
  UNIQUE KEY `uq_personal_horario_vigencia` (`horario_id`,`vigente_desde`),
  KEY `idx_personal_horario_version_periodo` (`horario_id`,`vigente_desde`,`vigente_hasta`),
  KEY `fk_personal_horario_version_creador` (`creado_por`),
  CONSTRAINT `chk_personal_horario_version_periodo` CHECK (`vigente_hasta` is null or `vigente_hasta` >= `vigente_desde`),
  CONSTRAINT `chk_personal_horario_version_tolerancias` CHECK (`tolerancia_entrada_minutos` <= 180 and `tolerancia_retorno_minutos` <= 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_incidencias_asistencia_revisiones` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `asistencia_id` int(10) unsigned DEFAULT NULL,
  `fecha` date NOT NULL,
  `tipo_incidencia` varchar(40) NOT NULL,
  `decision` enum('MANTENER_ESTADO') NOT NULL DEFAULT 'MANTENER_ESTADO',
  `comentario` varchar(500) NOT NULL,
  `revisado_por` int(10) unsigned NOT NULL,
  `revisado_en` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_incidencia_revision` (`empleado_id`,`fecha`,`tipo_incidencia`),
  KEY `idx_personal_incidencia_fecha` (`fecha`,`tipo_incidencia`),
  KEY `idx_personal_incidencia_asistencia` (`asistencia_id`),
  KEY `idx_personal_incidencia_revisor` (`revisado_por`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_justificaciones_asistencia` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `asistencia_id` int(10) unsigned NOT NULL,
  `empleado_id` int(10) unsigned NOT NULL,
  `tipo_incidencia` enum('TARDANZA','INASISTENCIA') NOT NULL,
  `categoria` enum('MEDICO','EMERGENCIA_FAMILIAR','TRANSPORTE','OTRO') NOT NULL,
  `motivo` varchar(500) NOT NULL,
  `estado` enum('PENDIENTE','APROBADA','RECHAZADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
  `origen_solicitud` enum('MOVIL','ADMIN') NOT NULL DEFAULT 'MOVIL',
  `revisado_por` int(10) unsigned DEFAULT NULL,
  `comentario_revision` varchar(500) DEFAULT NULL,
  `revisado_en` datetime DEFAULT NULL,
  `cancelado_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_personal_justificacion_empleado` (`empleado_id`,`created_at`),
  KEY `idx_personal_justificacion_asistencia` (`asistencia_id`,`estado`,`created_at`),
  KEY `idx_personal_justificacion_revision` (`estado`,`created_at`),
  KEY `idx_personal_justificacion_revisor` (`revisado_por`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_justificacion_asistencia_adjuntos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `justificacion_id` bigint(20) unsigned NOT NULL,
  `storage_key` varchar(100) NOT NULL,
  `nombre_original` varchar(255) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `bytes` int(10) unsigned NOT NULL,
  `sha256` char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_justificacion_adjunto_storage` (`storage_key`),
  UNIQUE KEY `uq_personal_justificacion_adjunto_solicitud` (`justificacion_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_liquidaciones_pago` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `periodo_pago_id` bigint(20) unsigned NOT NULL,
  `empleado_id` int(10) unsigned NOT NULL,
  `sede_id` int(10) unsigned NOT NULL,
  `acuerdo_id` bigint(20) unsigned DEFAULT NULL,
  `pago_mensual` decimal(12,2) NOT NULL DEFAULT 0.00,
  `honorario_mensual_pactado` decimal(12,2) NOT NULL DEFAULT 0.00,
  `politica_prorrateo` enum('DIAS_CALENDARIO','HONORARIO_COMPLETO') NOT NULL DEFAULT 'DIAS_CALENDARIO',
  `prorrateo_aplicado` tinyint(1) NOT NULL DEFAULT 0,
  `dias_periodo` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `dias_servicio` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `fecha_servicio_desde` date DEFAULT NULL,
  `fecha_servicio_hasta` date DEFAULT NULL,
  `factor_prorrateo` decimal(9,8) NOT NULL DEFAULT 1.00000000,
  `minutos_horas_extra` smallint(5) unsigned NOT NULL DEFAULT 0,
  `monto_horas_extra` decimal(12,2) NOT NULL DEFAULT 0.00,
  `otros_ingresos` decimal(12,2) NOT NULL DEFAULT 0.00,
  `adelantos` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cuotas_prestamo` decimal(12,2) NOT NULL DEFAULT 0.00,
  `otros_descuentos` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_servicio` decimal(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Importe bruto del RHE',
  `total_depositar` decimal(12,2) NOT NULL DEFAULT 0.00,
  `estado` enum('CONFIGURACION_PENDIENTE','BORRADOR','OBSERVADO','LISTO_PARA_PAGO','EN_REVISION','APROBADO','EN_LOTE','PAGADO') NOT NULL DEFAULT 'BORRADOR',
  `rhe_serie` varchar(8) DEFAULT NULL,
  `rhe_numero` varchar(20) DEFAULT NULL,
  `rhe_fecha_emision` date DEFAULT NULL,
  `rhe_importe` decimal(12,2) DEFAULT NULL,
  `aprobado_por` int(10) unsigned DEFAULT NULL,
  `aprobado_en` datetime DEFAULT NULL,
  `pago_fecha` datetime DEFAULT NULL,
  `pago_operacion` varchar(80) DEFAULT NULL,
  `pago_banco` varchar(100) DEFAULT NULL,
  `pago_cuenta_ultimos4` char(4) DEFAULT NULL,
  `pagado_por` int(10) unsigned DEFAULT NULL,
  `observacion` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_liquidacion_periodo_empleado` (`periodo_pago_id`,`empleado_id`),
  UNIQUE KEY `uq_personal_liquidacion_rhe` (`empleado_id`,`rhe_serie`,`rhe_numero`),
  KEY `idx_personal_liquidacion_sede_estado` (`sede_id`,`estado`),
  KEY `fk_personal_liquidacion_acuerdo` (`acuerdo_id`),
  KEY `fk_personal_liquidacion_pagador` (`pagado_por`),
  KEY `idx_personal_liquidacion_periodo_estado` (`periodo_pago_id`,`estado`),
  KEY `fk_personal_liquidacion_aprobador` (`aprobado_por`),
  CONSTRAINT `chk_personal_liquidacion_importes` CHECK (`pago_mensual` >= 0 and `monto_horas_extra` >= 0 and `otros_ingresos` >= 0 and `adelantos` >= 0 and `cuotas_prestamo` >= 0 and `otros_descuentos` >= 0 and `total_servicio` >= 0 and `total_depositar` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_liquidacion_conceptos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `liquidacion_id` bigint(20) unsigned NOT NULL,
  `tipo` enum('PAGO_MENSUAL','HORAS_EXTRA','OTRO_INGRESO','ADELANTO','CUOTA_PRESTAMO','OTRO_DESCUENTO') NOT NULL,
  `descripcion` varchar(180) NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `cantidad` decimal(12,2) DEFAULT NULL,
  `unidad` varchar(20) DEFAULT NULL,
  `origen_tipo` varchar(50) DEFAULT NULL,
  `origen_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_liquidacion_origen` (`liquidacion_id`,`origen_tipo`,`origen_id`),
  KEY `idx_personal_liquidacion_conceptos` (`liquidacion_id`,`tipo`),
  CONSTRAINT `chk_personal_liquidacion_concepto_monto` CHECK (`monto` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_lotes_pago` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int(10) unsigned NOT NULL,
  `periodo_pago_id` bigint(20) unsigned NOT NULL,
  `codigo` varchar(32) NOT NULL,
  `estado` enum('BORRADOR','EN_PROCESO','PAGADO','CANCELADO') NOT NULL DEFAULT 'BORRADOR',
  `cantidad_pagos` smallint(5) unsigned NOT NULL DEFAULT 0,
  `total_depositar` decimal(14,2) NOT NULL DEFAULT 0.00,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `procesado_por` int(10) unsigned DEFAULT NULL,
  `procesado_en` datetime DEFAULT NULL,
  `observacion` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_lote_pago_codigo` (`empresa_id`,`codigo`),
  KEY `idx_personal_lote_pago_periodo` (`periodo_pago_id`,`estado`),
  KEY `fk_personal_lote_pago_creador` (`creado_por`),
  KEY `fk_personal_lote_pago_procesador` (`procesado_por`),
  CONSTRAINT `chk_personal_lote_pago_total` CHECK (`cantidad_pagos` >= 0 and `total_depositar` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_lote_pago_detalles` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `lote_pago_id` bigint(20) unsigned NOT NULL,
  `liquidacion_id` bigint(20) unsigned NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `estado` enum('PENDIENTE','PAGADO','FALLIDO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  `numero_operacion` varchar(80) DEFAULT NULL,
  `pagado_en` datetime DEFAULT NULL,
  `observacion` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_lote_detalle_liquidacion` (`liquidacion_id`),
  KEY `idx_personal_lote_detalle_estado` (`lote_pago_id`,`estado`),
  CONSTRAINT `chk_personal_lote_detalle_monto` CHECK (`monto` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_marcaciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `request_id` char(36) DEFAULT NULL,
  `asistencia_id` int(10) unsigned NOT NULL,
  `dispositivo_id` int(10) unsigned DEFAULT NULL,
  `tipo_marcacion` enum('ENTRADA','SALIDA_ALMUERZO','REGRESO','SALIDA') NOT NULL,
  `origen_marcacion` enum('GPS','QR','NFC','BIOMETRICO','ADMINISTRATIVO') NOT NULL DEFAULT 'GPS',
  `hora_marcacion` datetime NOT NULL,
  `hora_programada` time DEFAULT NULL,
  `diferencia_programada_minutos` smallint(6) DEFAULT NULL,
  `clasificacion_tiempo` enum('ANTICIPADA','PUNTUAL','TARDANZA','DEMORADA','SALIDA_ANTICIPADA','SOBRETIEMPO_CANDIDATO') DEFAULT NULL,
  `latitud` decimal(10,8) NOT NULL,
  `longitud` decimal(11,8) NOT NULL,
  `precision_gps` decimal(6,2) DEFAULT NULL,
  `selfie_path` varchar(255) DEFAULT NULL,
  `red_wifi` varchar(100) DEFAULT NULL,
  `bluetooth` varchar(100) DEFAULT NULL,
  `dentro_de_radio` tinyint(1) NOT NULL DEFAULT 1,
  `distancia_sede_metros` decimal(9,2) DEFAULT NULL,
  `verificacion_identidad` enum('BIOMETRIA_DISPOSITIVO','SELFIE_REVISADA','ADMINISTRATIVA','NO_APLICA') NOT NULL DEFAULT 'NO_APLICA',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_marcacion_tipo` (`asistencia_id`,`tipo_marcacion`),
  UNIQUE KEY `uq_personal_marcacion_request` (`request_id`),
  KEY `idx_personal_marc_hora` (`hora_marcacion`),
  KEY `fk_personal_marc_disp` (`dispositivo_id`),
  KEY `idx_marcaciones_asistencia_hora` (`asistencia_id`,`hora_marcacion`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_notificaciones_app` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `tipo` varchar(50) NOT NULL,
  `titulo` varchar(160) NOT NULL,
  `mensaje` varchar(500) NOT NULL,
  `prioridad` enum('INFO','IMPORTANTE','URGENTE') NOT NULL DEFAULT 'INFO',
  `accion` enum('INICIO','HISTORIAL','PERFIL') NOT NULL DEFAULT 'INICIO',
  `referencia_tipo` varchar(50) DEFAULT NULL,
  `referencia_id` bigint(20) unsigned DEFAULT NULL,
  `clave_deduplicacion` varchar(190) DEFAULT NULL,
  `leida_en` datetime DEFAULT NULL,
  `expira_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_notificacion_clave` (`empleado_id`,`clave_deduplicacion`),
  KEY `idx_personal_notificacion_bandeja` (`empleado_id`,`leida_en`,`created_at`),
  KEY `idx_personal_notificacion_expira` (`expira_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_pago_acuerdos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `pago_mensual` decimal(12,2) NOT NULL,
  `politica_prorrateo` enum('DIAS_CALENDARIO','HONORARIO_COMPLETO') NOT NULL DEFAULT 'DIAS_CALENDARIO',
  `tarifa_hora_extra` decimal(10,2) NOT NULL DEFAULT 0.00,
  `banco` varchar(100) DEFAULT NULL,
  `tipo_cuenta` enum('AHORROS','CORRIENTE') DEFAULT NULL,
  `numero_cuenta` varchar(512) DEFAULT NULL COMMENT 'Valor cifrado por la aplicacion',
  `numero_cuenta_ultimos4` char(4) DEFAULT NULL,
  `cci` varchar(512) DEFAULT NULL COMMENT 'Valor cifrado por la aplicacion',
  `cci_ultimos4` char(4) DEFAULT NULL,
  `vigente_desde` date NOT NULL,
  `vigente_hasta` date DEFAULT NULL,
  `creado_por` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `acuerdo_activo` int(10) unsigned GENERATED ALWAYS AS (case when `vigente_hasta` is null then `empleado_id` else NULL end) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_pago_acuerdo_activo` (`acuerdo_activo`),
  KEY `idx_personal_pago_acuerdo_vigencia` (`empleado_id`,`vigente_desde`,`vigente_hasta`),
  KEY `fk_personal_pago_acuerdo_creador` (`creado_por`),
  CONSTRAINT `chk_personal_pago_acuerdo_importes` CHECK (`pago_mensual` >= 0 and `tarifa_hora_extra` >= 0),
  CONSTRAINT `chk_personal_pago_acuerdo_vigencia` CHECK (`vigente_hasta` is null or `vigente_hasta` >= `vigente_desde`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_pago_movimientos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `periodo` date NOT NULL COMMENT 'Primer dia del mes de aplicacion',
  `tipo` enum('ADELANTO','OTRO_INGRESO','OTRO_DESCUENTO') NOT NULL,
  `concepto` varchar(160) NOT NULL,
  `monto` decimal(12,2) NOT NULL,
  `estado` enum('PENDIENTE','APLICADO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  `creado_por` int(10) unsigned DEFAULT NULL,
  `aplicado_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_personal_pago_movimiento_periodo` (`periodo`,`estado`,`empleado_id`),
  KEY `fk_personal_pago_movimiento_empleado` (`empleado_id`),
  KEY `fk_personal_pago_movimiento_creador` (`creado_por`),
  CONSTRAINT `chk_personal_pago_movimiento_monto` CHECK (`monto` > 0),
  CONSTRAINT `chk_personal_pago_movimiento_periodo` CHECK (dayofmonth(`periodo`) = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_pago_notas` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int(10) unsigned NOT NULL,
  `empleado_id` int(10) unsigned NOT NULL,
  `periodo` date NOT NULL COMMENT 'Primer dia del mes al que corresponde la nota',
  `nota` varchar(800) NOT NULL,
  `monto_referencial` decimal(12,2) DEFAULT NULL,
  `estado` enum('ACTIVA','ANULADA') NOT NULL DEFAULT 'ACTIVA',
  `creado_por` int(10) unsigned NOT NULL,
  `anulado_por` int(10) unsigned DEFAULT NULL,
  `motivo_anulacion` varchar(300) DEFAULT NULL,
  `anulado_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_personal_pago_notas_expediente` (`empresa_id`,`empleado_id`,`periodo`,`estado`,`created_at`),
  KEY `fk_personal_pago_nota_empleado` (`empleado_id`),
  KEY `fk_personal_pago_nota_creador` (`creado_por`),
  KEY `fk_personal_pago_nota_anulador` (`anulado_por`),
  CONSTRAINT `chk_personal_pago_nota_periodo` CHECK (dayofmonth(`periodo`) = 1),
  CONSTRAINT `chk_personal_pago_nota_monto` CHECK (`monto_referencial` is null or `monto_referencial` >= 0),
  CONSTRAINT `chk_personal_pago_nota_anulacion` CHECK (`estado` = 'ACTIVA' and `anulado_por` is null and `motivo_anulacion` is null and `anulado_en` is null or `estado` = 'ANULADA' and `motivo_anulacion` is not null and `anulado_en` is not null)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_pago_transiciones` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int(10) unsigned NOT NULL,
  `entidad` enum('PERIODO','LIQUIDACION','LOTE') NOT NULL,
  `entidad_id` bigint(20) unsigned NOT NULL,
  `estado_anterior` varchar(40) DEFAULT NULL,
  `estado_nuevo` varchar(40) NOT NULL,
  `motivo` varchar(500) DEFAULT NULL,
  `usuario_id` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_personal_pago_transicion_entidad` (`entidad`,`entidad_id`,`created_at`),
  KEY `idx_personal_pago_transicion_empresa` (`empresa_id`,`created_at`),
  KEY `fk_personal_pago_transicion_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_periodos_pago` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int(10) unsigned NOT NULL,
  `periodo` date NOT NULL COMMENT 'Primer dia del mes liquidado',
  `estado` enum('BORRADOR','EN_REVISION','APROBADO','EN_PAGO','PAGADO','CERRADO') NOT NULL DEFAULT 'BORRADOR',
  `generado_por` int(10) unsigned DEFAULT NULL,
  `enviado_revision_por` int(10) unsigned DEFAULT NULL,
  `enviado_revision_en` datetime DEFAULT NULL,
  `aprobado_por` int(10) unsigned DEFAULT NULL,
  `aprobado_en` datetime DEFAULT NULL,
  `cerrado_por` int(10) unsigned DEFAULT NULL,
  `cerrado_en` datetime DEFAULT NULL,
  `observacion` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_periodo_pago` (`empresa_id`,`periodo`),
  KEY `fk_personal_periodo_pago_generador` (`generado_por`),
  KEY `fk_personal_periodo_pago_aprobador` (`aprobado_por`),
  KEY `idx_personal_periodo_pago_estado` (`empresa_id`,`estado`,`periodo`),
  KEY `fk_personal_periodo_pago_revisor` (`enviado_revision_por`),
  KEY `fk_personal_periodo_pago_cierre` (`cerrado_por`),
  CONSTRAINT `chk_personal_periodo_pago_mes` CHECK (dayofmonth(`periodo`) = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_prestamos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `concepto` varchar(160) NOT NULL,
  `monto_original` decimal(12,2) NOT NULL,
  `saldo_pendiente` decimal(12,2) NOT NULL,
  `cuota_mensual` decimal(12,2) NOT NULL,
  `periodo_inicio` date NOT NULL,
  `estado` enum('ACTIVO','PAGADO','CANCELADO') NOT NULL DEFAULT 'ACTIVO',
  `creado_por` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_personal_prestamo_activo` (`empleado_id`,`estado`,`periodo_inicio`),
  KEY `fk_personal_prestamo_creador` (`creado_por`),
  CONSTRAINT `chk_personal_prestamo_importes` CHECK (`monto_original` > 0 and `saldo_pendiente` >= 0 and `saldo_pendiente` <= `monto_original` and `cuota_mensual` > 0 and `cuota_mensual` <= `monto_original`),
  CONSTRAINT `chk_personal_prestamo_periodo` CHECK (dayofmonth(`periodo_inicio`) = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_sesiones_app` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `dispositivo_id` int(10) unsigned NOT NULL,
  `refresh_token_hash` char(64) NOT NULL,
  `expira_en` datetime NOT NULL,
  `ultimo_uso_en` datetime DEFAULT NULL,
  `revocado_en` datetime DEFAULT NULL,
  `ip_creacion` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_sesion_refresh_hash` (`refresh_token_hash`),
  KEY `idx_personal_sesion_empleado_estado` (`empleado_id`,`revocado_en`,`expira_en`),
  KEY `fk_personal_sesion_dispositivo` (`dispositivo_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_sobretiempo_solicitudes` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `asistencia_id` int(10) unsigned NOT NULL,
  `empleado_id` int(10) unsigned NOT NULL,
  `marcacion_id` int(10) unsigned DEFAULT NULL,
  `tipo_evento` enum('ALMUERZO_DIFERIDO','SALIDA_POSTERIOR') NOT NULL,
  `origen` enum('DETECCION_AUTOMATICA','DECLARACION_EMPLEADO') NOT NULL DEFAULT 'DETECCION_AUTOMATICA',
  `minutos_detectados` smallint(5) unsigned NOT NULL,
  `minutos_aprobados` smallint(5) unsigned DEFAULT NULL,
  `umbral_aplicado_minutos` smallint(5) unsigned NOT NULL,
  `comentario_empleado` varchar(500) DEFAULT NULL,
  `sustento_storage_key` varchar(120) DEFAULT NULL,
  `sustento_nombre` varchar(255) DEFAULT NULL,
  `sustento_mime` varchar(80) DEFAULT NULL,
  `sustento_bytes` int(10) unsigned DEFAULT NULL,
  `sustento_sha256` char(64) DEFAULT NULL,
  `declarado_en` datetime DEFAULT NULL,
  `estado` enum('PENDIENTE','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  `revisado_por` int(10) unsigned DEFAULT NULL,
  `comentario_revision` varchar(500) DEFAULT NULL,
  `revisado_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_sobretiempo_segmento` (`asistencia_id`,`tipo_evento`),
  UNIQUE KEY `uq_personal_sobretiempo_marcacion` (`marcacion_id`),
  KEY `idx_personal_sobretiempo_estado_fecha` (`estado`,`created_at`),
  KEY `idx_personal_sobretiempo_empleado_fecha` (`empleado_id`,`created_at`),
  KEY `fk_personal_sobretiempo_revisor` (`revisado_por`),
  KEY `idx_personal_sobretiempo_asistencia` (`asistencia_id`),
  KEY `idx_personal_sobretiempo_sustento` (`sustento_storage_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_solicitudes_marcacion` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `request_id` char(36) NOT NULL,
  `empleado_id` int(10) unsigned NOT NULL,
  `sede_id` int(10) unsigned NOT NULL,
  `dispositivo_id` int(10) unsigned NOT NULL,
  `tipo_marcacion` enum('ENTRADA','SALIDA_ALMUERZO','REGRESO','SALIDA') NOT NULL,
  `latitud` decimal(10,8) NOT NULL,
  `longitud` decimal(11,8) NOT NULL,
  `precision_gps` decimal(7,2) NOT NULL,
  `distancia_sede_metros` decimal(9,2) NOT NULL,
  `capturada_en` datetime NOT NULL,
  `codigo_fallo_biometrico` varchar(50) NOT NULL,
  `selfie_storage_key` varchar(255) NOT NULL,
  `selfie_sha256` char(64) NOT NULL,
  `selfie_mime_type` varchar(50) NOT NULL,
  `selfie_bytes_size` int(10) unsigned NOT NULL,
  `estado` enum('PENDIENTE','APROBADA','RECHAZADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
  `revisado_por` int(10) unsigned DEFAULT NULL,
  `comentario_revision` varchar(500) DEFAULT NULL,
  `revisado_en` datetime DEFAULT NULL,
  `marcacion_id` int(10) unsigned DEFAULT NULL,
  `expira_en` datetime NOT NULL,
  `evidencia_estado` enum('ACTIVA','PENDIENTE_ELIMINACION','ELIMINADA') NOT NULL DEFAULT 'ACTIVA',
  `evidencia_eliminada_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_solicitud_marcacion_request` (`request_id`),
  KEY `idx_personal_solicitud_sede_estado_fecha` (`sede_id`,`estado`,`capturada_en`),
  KEY `idx_personal_solicitud_empleado_fecha` (`empleado_id`,`capturada_en`),
  KEY `idx_personal_solicitud_expiracion` (`estado`,`expira_en`),
  KEY `fk_personal_solicitud_dispositivo` (`dispositivo_id`),
  KEY `fk_personal_solicitud_revisor` (`revisado_por`),
  KEY `fk_personal_solicitud_marcacion` (`marcacion_id`),
  KEY `idx_personal_solicitud_evidencia` (`evidencia_estado`,`estado`,`expira_en`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_solicitudes_permisos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `tipo_permiso` enum('MEDICO','PERSONAL','FAMILIAR','OTRO') NOT NULL,
  `fecha_inicio` datetime NOT NULL,
  `fecha_fin` datetime NOT NULL,
  `motivo` text NOT NULL,
  `origen_solicitud` enum('ADMIN','MOVIL') NOT NULL DEFAULT 'ADMIN',
  `estado` enum('PENDIENTE','APROBADO','RECHAZADO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  `aprobado_por` int(10) unsigned DEFAULT NULL COMMENT 'Referencia a tu tabla actual de usuarios',
  `comentario_resolucion` varchar(500) DEFAULT NULL,
  `resuelto_en` datetime DEFAULT NULL,
  `cancelado_por` int(10) unsigned DEFAULT NULL,
  `motivo_cancelacion` varchar(500) DEFAULT NULL,
  `cancelado_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_personal_perm_emp` (`empleado_id`),
  KEY `fk_personal_perm_aprob` (`aprobado_por`),
  KEY `idx_personal_permisos_estado_fecha` (`estado`,`fecha_inicio`,`fecha_fin`),
  KEY `idx_personal_permisos_cancelado_por` (`cancelado_por`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_solicitud_permiso_adjuntos` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `solicitud_id` int(10) unsigned NOT NULL,
  `storage_key` varchar(100) NOT NULL,
  `nombre_original` varchar(255) NOT NULL,
  `mime_type` varchar(100) NOT NULL,
  `bytes` int(10) unsigned NOT NULL,
  `sha256` char(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_personal_permiso_adjunto_storage` (`storage_key`),
  UNIQUE KEY `uq_personal_permiso_adjunto_solicitud` (`solicitud_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `personal_vacaciones` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `empleado_id` int(10) unsigned NOT NULL,
  `periodo_anio` year(4) NOT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date NOT NULL,
  `dias_tomados` int(10) NOT NULL,
  `motivo` varchar(500) DEFAULT NULL,
  `estado` enum('SOLICITADA','APROBADA','RECHAZADA','PROGRAMADA','EN_CURSO','COMPLETADA','CANCELADA') NOT NULL DEFAULT 'SOLICITADA',
  `revisado_por` int(10) unsigned DEFAULT NULL,
  `comentario_revision` varchar(500) DEFAULT NULL,
  `revisado_en` datetime DEFAULT NULL,
  `cancelado_por` int(10) unsigned DEFAULT NULL,
  `motivo_cancelacion` varchar(500) DEFAULT NULL,
  `cancelado_en` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_personal_vac_emp` (`empleado_id`),
  KEY `idx_personal_vacaciones_estado_fecha` (`estado`,`fecha_inicio`,`fecha_fin`),
  KEY `fk_personal_vacaciones_revisado_por` (`revisado_por`),
  KEY `idx_personal_vacaciones_cancelado_por` (`cancelado_por`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY `idx_plantillas_sede_estado` (`sede_id`,`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `roles` (
  `id` smallint(5) unsigned NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `tipo_usuario` enum('SISTEMA','EMPRESA') NOT NULL,
  `tipo_alcance` enum('SISTEMA','EMPRESA','SEDE') NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `estado` enum('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_codigo` (`codigo`),
  KEY `idx_roles_tipo_estado` (`tipo_usuario`,`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `rol_permisos` (
  `rol_id` smallint(5) unsigned NOT NULL,
  `permiso_id` smallint(5) unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`rol_id`,`permiso_id`),
  KEY `fk_rol_permisos_permiso` (`permiso_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sedes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int(10) unsigned NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `direccion` varchar(150) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `estado` enum('activo','inactivo') NOT NULL DEFAULT 'activo',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `latitud` decimal(10,8) DEFAULT NULL,
  `longitud` decimal(11,8) DEFAULT NULL,
  `radio_permitido_metros` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sedes_empresa_estado` (`empresa_id`,`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sede_configuracion` (
  `sede_id` int(10) unsigned NOT NULL,
  `plantilla_whatsapp_default_id` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`sede_id`),
  KEY `fk_sede_configuracion_plantilla_default` (`plantilla_whatsapp_default_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `urbano_credenciales_sede` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `username` varchar(120) NOT NULL,
  `password_cipher` text NOT NULL,
  `password_iv` varchar(32) NOT NULL,
  `password_auth_tag` varchar(32) NOT NULL,
  `estado` enum('activo','inactivo') NOT NULL DEFAULT 'activo',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_urbano_credenciales_sede` (`sede_id`),
  KEY `idx_urbano_credenciales_estado` (`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `urbano_route_cache` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `sede_id` int(10) unsigned DEFAULT NULL,
  `route_id` varchar(30) NOT NULL,
  `total_guias` int(10) unsigned NOT NULL DEFAULT 0,
  `total_registros` int(10) unsigned NOT NULL DEFAULT 0,
  `payload_json` longtext NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_urbano_route_cache_usuario` (`usuario_id`),
  KEY `idx_urbano_route_cache_sede` (`sede_id`),
  KEY `idx_urbano_route_cache_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `usuarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `usuario` varchar(60) NOT NULL,
  `foto` varchar(512) DEFAULT NULL COMMENT 'URL relativa de la foto de perfil administrada por el backend',
  `password_hash` varchar(255) NOT NULL,
  `tipo_usuario` enum('SISTEMA','EMPRESA') NOT NULL DEFAULT 'EMPRESA',
  `estado` enum('activo','inactivo') NOT NULL DEFAULT 'activo',
  `ultimo_acceso_at` datetime DEFAULT NULL,
  `password_actualizado_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuario` (`usuario`),
  KEY `idx_usuarios_tipo_estado` (`tipo_usuario`,`estado`),
  KEY `idx_usuarios_ultimo_acceso` (`ultimo_acceso_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `usuario_asignaciones` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `usuario_id` int(10) unsigned NOT NULL,
  `rol_id` smallint(5) unsigned NOT NULL,
  `empresa_id` int(10) unsigned DEFAULT NULL,
  `sede_id` int(10) unsigned DEFAULT NULL,
  `alcance` enum('SISTEMA','EMPRESA','SEDE') NOT NULL,
  `es_principal` tinyint(1) NOT NULL DEFAULT 0,
  `estado` enum('ACTIVA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  `vigente_desde` datetime NOT NULL DEFAULT current_timestamp(),
  `vigente_hasta` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_usuario_asignaciones_usuario` (`usuario_id`,`estado`),
  KEY `idx_usuario_asignaciones_empresa` (`empresa_id`,`estado`),
  KEY `idx_usuario_asignaciones_sede` (`sede_id`,`estado`),
  KEY `fk_usuario_asignaciones_rol` (`rol_id`),
  CONSTRAINT `chk_usuario_asignacion_vigencia` CHECK (`vigente_hasta` is null or `vigente_hasta` >= `vigente_desde`),
  CONSTRAINT `chk_usuario_asignacion_alcance` CHECK (`alcance` = 'SISTEMA' and `empresa_id` is null and `sede_id` is null or `alcance` = 'EMPRESA' and `empresa_id` is not null and `sede_id` is null or `alcance` = 'SEDE' and `empresa_id` is not null and `sede_id` is not null)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `usuario_permisos` (
  `usuario_id` int(10) unsigned NOT NULL,
  `permiso_id` smallint(5) unsigned NOT NULL,
  `efecto` enum('PERMITIR','DENEGAR') NOT NULL,
  `motivo` varchar(255) DEFAULT NULL,
  `vigente_hasta` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`usuario_id`,`permiso_id`),
  KEY `fk_usuario_permisos_permiso` (`permiso_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  KEY `idx_sesiones_sede_activo_estado` (`sede_id`,`activo`,`estado`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `zonas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `sede_id` int(10) unsigned NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sede_nombre` (`sede_id`,`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relaciones declaradas despues de crear todas las tablas.
ALTER TABLE `auditoria_sistema` ADD CONSTRAINT `fk_auditoria_actor` FOREIGN KEY (`actor_usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `auditoria_sistema` ADD CONSTRAINT `fk_auditoria_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `auditoria_sistema` ADD CONSTRAINT `fk_auditoria_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `avisos_diarios` ADD CONSTRAINT `fk_avisos_entregado_usuario` FOREIGN KEY (`entregado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `avisos_diarios` ADD CONSTRAINT `fk_avisos_lote` FOREIGN KEY (`lote_id`) REFERENCES `lotes_carga` (`id`) ON UPDATE CASCADE;
ALTER TABLE `avisos_diarios` ADD CONSTRAINT `fk_avisos_marcado_usuario` FOREIGN KEY (`marcado_manual_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `avisos_diarios` ADD CONSTRAINT `fk_avisos_plantilla` FOREIGN KEY (`id_plantilla`) REFERENCES `plantillas` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `avisos_diarios` ADD CONSTRAINT `fk_avisos_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `avisos_diarios` ADD CONSTRAINT `fk_avisos_sesion` FOREIGN KEY (`whatsapp_sesion_id`) REFERENCES `whatsapp_sesiones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `lotes_carga` ADD CONSTRAINT `fk_lotes_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `lotes_carga` ADD CONSTRAINT `fk_lotes_usuario_creador` FOREIGN KEY (`id_usuario_creador`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL;
ALTER TABLE `mensajes_log` ADD CONSTRAINT `fk_log_aviso` FOREIGN KEY (`aviso_id`) REFERENCES `avisos_diarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `mensajes_log` ADD CONSTRAINT `fk_log_lote` FOREIGN KEY (`lote_id`) REFERENCES `lotes_carga` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `mensajes_log` ADD CONSTRAINT `fk_log_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `mensajes_log` ADD CONSTRAINT `fk_log_sesion` FOREIGN KEY (`whatsapp_sesion_id`) REFERENCES `whatsapp_sesiones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `mobile_app_releases` ADD CONSTRAINT `fk_mobile_release_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `paquetes` ADD CONSTRAINT `fk_paquetes_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `paquetes` ADD CONSTRAINT `fk_paquetes_sede_escaneo` FOREIGN KEY (`sede_id_escaneo`) REFERENCES `sedes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `paquetes` ADD CONSTRAINT `fk_paquetes_usuario` FOREIGN KEY (`usuario_id_escaneo`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `paquetes_auditoria` ADD CONSTRAINT `fk_paquetes_aud_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `paquetes_auditoria` ADD CONSTRAINT `fk_paquetes_aud_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_acceso_app` ADD CONSTRAINT `fk_personal_acceso_emp` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_activaciones_dispositivo` ADD CONSTRAINT `fk_personal_activacion_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_activaciones_dispositivo` ADD CONSTRAINT `fk_personal_activacion_usuario` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_asistencias` ADD CONSTRAINT `fk_personal_asist_emp` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_asistencias` ADD CONSTRAINT `fk_personal_asist_horario_version` FOREIGN KEY (`horario_version_id`) REFERENCES `personal_horario_versiones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_auditoria_eventos` ADD CONSTRAINT `fk_personal_auditoria_evento_dispositivo` FOREIGN KEY (`dispositivo_id`) REFERENCES `personal_dispositivos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_auditoria_eventos` ADD CONSTRAINT `fk_personal_auditoria_evento_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_auditoria_eventos` ADD CONSTRAINT `fk_personal_auditoria_evento_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_calendario_laboral` ADD CONSTRAINT `fk_personal_calendario_cancelador` FOREIGN KEY (`cancelado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_calendario_laboral` ADD CONSTRAINT `fk_personal_calendario_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_calendario_laboral` ADD CONSTRAINT `fk_personal_calendario_horario` FOREIGN KEY (`horario_id`) REFERENCES `personal_horarios` (`id`);
ALTER TABLE `personal_calendario_laboral` ADD CONSTRAINT `fk_personal_calendario_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`);
ALTER TABLE `personal_calendario_propuestas` ADD CONSTRAINT `fk_personal_cal_prop_decisor` FOREIGN KEY (`decidido_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_calendario_propuestas` ADD CONSTRAINT `fk_personal_cal_prop_evento` FOREIGN KEY (`evento_calendario_id`) REFERENCES `personal_calendario_laboral` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_cierres_asistencia_diaria` ADD CONSTRAINT `fk_personal_cierre_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_codigo_empleado_secuencias` ADD CONSTRAINT `fk_personal_codigo_empleado_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_configuracion_gps_sedes` ADD CONSTRAINT `fk_personal_cfg_gps_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_correcciones_asistencia` ADD CONSTRAINT `fk_personal_correccion_asistencia` FOREIGN KEY (`asistencia_id`) REFERENCES `personal_asistencias` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_correcciones_asistencia` ADD CONSTRAINT `fk_personal_correccion_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_correcciones_asistencia` ADD CONSTRAINT `fk_personal_correccion_usuario` FOREIGN KEY (`corregido_por`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_desafios_marcacion` ADD CONSTRAINT `fk_personal_desafio_dispositivo` FOREIGN KEY (`dispositivo_id`) REFERENCES `personal_dispositivos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_desafios_marcacion` ADD CONSTRAINT `fk_personal_desafio_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_dispositivos` ADD CONSTRAINT `fk_personal_disp_emp` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_dispositivos` ADD CONSTRAINT `fk_personal_dispositivo_autorizado_por` FOREIGN KEY (`autorizado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_dispositivos` ADD CONSTRAINT `fk_personal_dispositivo_revocado_por` FOREIGN KEY (`revocado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_empleados` ADD CONSTRAINT `fk_personal_emp_cargo` FOREIGN KEY (`cargo_id`) REFERENCES `personal_cargos` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_empleados` ADD CONSTRAINT `fk_personal_emp_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_empleado_sedes` ADD CONSTRAINT `fk_personal_empleado_sede_asignador` FOREIGN KEY (`asignado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_empleado_sedes` ADD CONSTRAINT `fk_personal_empleado_sede_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_empleado_sedes` ADD CONSTRAINT `fk_personal_empleado_sede_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_evidencias_marcacion` ADD CONSTRAINT `fk_personal_evidencia_marcacion` FOREIGN KEY (`marcacion_id`) REFERENCES `personal_marcaciones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_gps_historial` ADD CONSTRAINT `fk_personal_gps_hist_emp` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_gps_tiempo_real` ADD CONSTRAINT `fk_personal_gps_tr_emp` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_horarios` ADD CONSTRAINT `fk_personal_horario_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_horario_asignaciones` ADD CONSTRAINT `fk_personal_hor_asig_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_horario_asignaciones` ADD CONSTRAINT `fk_personal_hor_asig_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`);
ALTER TABLE `personal_horario_asignaciones` ADD CONSTRAINT `fk_personal_hor_asig_horario` FOREIGN KEY (`horario_id`) REFERENCES `personal_horarios` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_horario_asignaciones` ADD CONSTRAINT `fk_personal_hor_asig_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`);
ALTER TABLE `personal_horario_versiones` ADD CONSTRAINT `fk_personal_horario_version_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_horario_versiones` ADD CONSTRAINT `fk_personal_horario_version_horario` FOREIGN KEY (`horario_id`) REFERENCES `personal_horarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_incidencias_asistencia_revisiones` ADD CONSTRAINT `fk_personal_incidencia_asistencia` FOREIGN KEY (`asistencia_id`) REFERENCES `personal_asistencias` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_incidencias_asistencia_revisiones` ADD CONSTRAINT `fk_personal_incidencia_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_incidencias_asistencia_revisiones` ADD CONSTRAINT `fk_personal_incidencia_revisor` FOREIGN KEY (`revisado_por`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_justificaciones_asistencia` ADD CONSTRAINT `fk_personal_justificacion_asistencia` FOREIGN KEY (`asistencia_id`) REFERENCES `personal_asistencias` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_justificaciones_asistencia` ADD CONSTRAINT `fk_personal_justificacion_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_justificaciones_asistencia` ADD CONSTRAINT `fk_personal_justificacion_revisor` FOREIGN KEY (`revisado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_justificacion_asistencia_adjuntos` ADD CONSTRAINT `fk_personal_justificacion_adjunto` FOREIGN KEY (`justificacion_id`) REFERENCES `personal_justificaciones_asistencia` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_liquidaciones_pago` ADD CONSTRAINT `fk_personal_liquidacion_acuerdo` FOREIGN KEY (`acuerdo_id`) REFERENCES `personal_pago_acuerdos` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_liquidaciones_pago` ADD CONSTRAINT `fk_personal_liquidacion_aprobador` FOREIGN KEY (`aprobado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_liquidaciones_pago` ADD CONSTRAINT `fk_personal_liquidacion_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_liquidaciones_pago` ADD CONSTRAINT `fk_personal_liquidacion_pagador` FOREIGN KEY (`pagado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_liquidaciones_pago` ADD CONSTRAINT `fk_personal_liquidacion_periodo` FOREIGN KEY (`periodo_pago_id`) REFERENCES `personal_periodos_pago` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_liquidaciones_pago` ADD CONSTRAINT `fk_personal_liquidacion_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_liquidacion_conceptos` ADD CONSTRAINT `fk_personal_liquidacion_concepto` FOREIGN KEY (`liquidacion_id`) REFERENCES `personal_liquidaciones_pago` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_lotes_pago` ADD CONSTRAINT `fk_personal_lote_pago_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_lotes_pago` ADD CONSTRAINT `fk_personal_lote_pago_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_lotes_pago` ADD CONSTRAINT `fk_personal_lote_pago_periodo` FOREIGN KEY (`periodo_pago_id`) REFERENCES `personal_periodos_pago` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_lotes_pago` ADD CONSTRAINT `fk_personal_lote_pago_procesador` FOREIGN KEY (`procesado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_lote_pago_detalles` ADD CONSTRAINT `fk_personal_lote_detalle_liquidacion` FOREIGN KEY (`liquidacion_id`) REFERENCES `personal_liquidaciones_pago` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_lote_pago_detalles` ADD CONSTRAINT `fk_personal_lote_detalle_lote` FOREIGN KEY (`lote_pago_id`) REFERENCES `personal_lotes_pago` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_marcaciones` ADD CONSTRAINT `fk_personal_marc_asist` FOREIGN KEY (`asistencia_id`) REFERENCES `personal_asistencias` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_marcaciones` ADD CONSTRAINT `fk_personal_marc_disp` FOREIGN KEY (`dispositivo_id`) REFERENCES `personal_dispositivos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_notificaciones_app` ADD CONSTRAINT `fk_personal_notificacion_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_pago_acuerdos` ADD CONSTRAINT `fk_personal_pago_acuerdo_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_pago_acuerdos` ADD CONSTRAINT `fk_personal_pago_acuerdo_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_pago_movimientos` ADD CONSTRAINT `fk_personal_pago_movimiento_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_pago_movimientos` ADD CONSTRAINT `fk_personal_pago_movimiento_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_pago_notas` ADD CONSTRAINT `fk_personal_pago_nota_anulador` FOREIGN KEY (`anulado_por`) REFERENCES `usuarios` (`id`);
ALTER TABLE `personal_pago_notas` ADD CONSTRAINT `fk_personal_pago_nota_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_pago_notas` ADD CONSTRAINT `fk_personal_pago_nota_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_pago_notas` ADD CONSTRAINT `fk_personal_pago_nota_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_pago_transiciones` ADD CONSTRAINT `fk_personal_pago_transicion_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_pago_transiciones` ADD CONSTRAINT `fk_personal_pago_transicion_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_periodos_pago` ADD CONSTRAINT `fk_personal_periodo_pago_aprobador` FOREIGN KEY (`aprobado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_periodos_pago` ADD CONSTRAINT `fk_personal_periodo_pago_cierre` FOREIGN KEY (`cerrado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_periodos_pago` ADD CONSTRAINT `fk_personal_periodo_pago_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_periodos_pago` ADD CONSTRAINT `fk_personal_periodo_pago_generador` FOREIGN KEY (`generado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_periodos_pago` ADD CONSTRAINT `fk_personal_periodo_pago_revisor` FOREIGN KEY (`enviado_revision_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_prestamos` ADD CONSTRAINT `fk_personal_prestamo_creador` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_prestamos` ADD CONSTRAINT `fk_personal_prestamo_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_sesiones_app` ADD CONSTRAINT `fk_personal_sesion_dispositivo` FOREIGN KEY (`dispositivo_id`) REFERENCES `personal_dispositivos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_sesiones_app` ADD CONSTRAINT `fk_personal_sesion_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_sobretiempo_solicitudes` ADD CONSTRAINT `fk_personal_sobretiempo_asistencia` FOREIGN KEY (`asistencia_id`) REFERENCES `personal_asistencias` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_sobretiempo_solicitudes` ADD CONSTRAINT `fk_personal_sobretiempo_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_sobretiempo_solicitudes` ADD CONSTRAINT `fk_personal_sobretiempo_marcacion` FOREIGN KEY (`marcacion_id`) REFERENCES `personal_marcaciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_sobretiempo_solicitudes` ADD CONSTRAINT `fk_personal_sobretiempo_revisor` FOREIGN KEY (`revisado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_solicitudes_marcacion` ADD CONSTRAINT `fk_personal_solicitud_dispositivo` FOREIGN KEY (`dispositivo_id`) REFERENCES `personal_dispositivos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_solicitudes_marcacion` ADD CONSTRAINT `fk_personal_solicitud_empleado` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_solicitudes_marcacion` ADD CONSTRAINT `fk_personal_solicitud_marcacion` FOREIGN KEY (`marcacion_id`) REFERENCES `personal_marcaciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_solicitudes_marcacion` ADD CONSTRAINT `fk_personal_solicitud_revisor` FOREIGN KEY (`revisado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_solicitudes_marcacion` ADD CONSTRAINT `fk_personal_solicitud_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `personal_solicitudes_permisos` ADD CONSTRAINT `fk_personal_perm_aprob` FOREIGN KEY (`aprobado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_solicitudes_permisos` ADD CONSTRAINT `fk_personal_perm_emp` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_solicitudes_permisos` ADD CONSTRAINT `fk_personal_permisos_cancelado_por` FOREIGN KEY (`cancelado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_solicitud_permiso_adjuntos` ADD CONSTRAINT `fk_personal_permiso_adjunto_solicitud` FOREIGN KEY (`solicitud_id`) REFERENCES `personal_solicitudes_permisos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_vacaciones` ADD CONSTRAINT `fk_personal_vac_emp` FOREIGN KEY (`empleado_id`) REFERENCES `personal_empleados` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `personal_vacaciones` ADD CONSTRAINT `fk_personal_vacaciones_cancelado_por` FOREIGN KEY (`cancelado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `personal_vacaciones` ADD CONSTRAINT `fk_personal_vacaciones_revisado_por` FOREIGN KEY (`revisado_por`) REFERENCES `usuarios` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `plantillas` ADD CONSTRAINT `fk_plantillas_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `rol_permisos` ADD CONSTRAINT `fk_rol_permisos_permiso` FOREIGN KEY (`permiso_id`) REFERENCES `permisos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `rol_permisos` ADD CONSTRAINT `fk_rol_permisos_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `sedes` ADD CONSTRAINT `fk_sedes_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON UPDATE CASCADE;
ALTER TABLE `sede_configuracion` ADD CONSTRAINT `fk_sede_config_plantilla` FOREIGN KEY (`plantilla_whatsapp_default_id`) REFERENCES `plantillas` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `sede_configuracion` ADD CONSTRAINT `fk_sede_config_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `urbano_credenciales_sede` ADD CONSTRAINT `fk_urbano_cred_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `urbano_route_cache` ADD CONSTRAINT `fk_urbano_cache_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `urbano_route_cache` ADD CONSTRAINT `fk_urbano_cache_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `usuario_asignaciones` ADD CONSTRAINT `fk_usuario_asignaciones_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`);
ALTER TABLE `usuario_asignaciones` ADD CONSTRAINT `fk_usuario_asignaciones_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON UPDATE CASCADE;
ALTER TABLE `usuario_asignaciones` ADD CONSTRAINT `fk_usuario_asignaciones_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`);
ALTER TABLE `usuario_asignaciones` ADD CONSTRAINT `fk_usuario_asignaciones_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON UPDATE CASCADE;
ALTER TABLE `usuario_permisos` ADD CONSTRAINT `fk_usuario_permisos_permiso` FOREIGN KEY (`permiso_id`) REFERENCES `permisos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `usuario_permisos` ADD CONSTRAINT `fk_usuario_permisos_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `whatsapp_sesiones` ADD CONSTRAINT `fk_sesiones_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON UPDATE CASCADE;
ALTER TABLE `zonas` ADD CONSTRAINT `fk_zonas_sede` FOREIGN KEY (`sede_id`) REFERENCES `sedes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;

CREATE OR REPLACE ALGORITHM=UNDEFINED SQL SECURITY INVOKER VIEW `v_estadisticas_lotes` AS select `l`.`id` AS `id_lote`,`s`.`nombre` AS `sede_nombre`,`u`.`nombre` AS `creador_por`,`l`.`fecha` AS `fecha`,`l`.`nombre_lote` AS `nombre_lote`,`l`.`zona` AS `zona`,`l`.`estado` AS `estado`,`l`.`created_at` AS `fecha_creacion`,count(`a`.`id`) AS `total_avisos`,sum(`a`.`estado_aviso` = 'pendiente') AS `avisos_pendientes`,sum(`a`.`estado_aviso` = 'en_cola') AS `avisos_en_cola`,sum(`a`.`estado_aviso` = 'enviado') AS `avisos_enviados`,sum(`a`.`estado_aviso` = 'enviado_manual') AS `avisos_enviados_manual`,sum(`a`.`estado_aviso` = 'fallido') AS `avisos_fallidos`,sum(`a`.`estado_aviso` = 'sin_whatsapp') AS `avisos_sin_whatsapp`,sum(`a`.`estado_aviso` = 'cancelado') AS `avisos_cancelados`,ifnull(round((sum(`a`.`estado_aviso` = 'enviado') + sum(`a`.`estado_aviso` = 'enviado_manual')) * 100.0 / nullif(count(`a`.`id`),0),1),0) AS `porcentaje_exito` from (((`lotes_carga` `l` left join `sedes` `s` on(`s`.`id` = `l`.`sede_id`)) left join `usuarios` `u` on(`u`.`id` = `l`.`id_usuario_creador`)) left join `avisos_diarios` `a` on(`a`.`lote_id` = `l`.`id`)) where `l`.`fecha_eliminacion` is null group by `l`.`id`;

-- Catalogos de autorizacion requeridos para iniciar la plataforma.
INSERT INTO `roles` (`id`, `codigo`, `nombre`, `tipo_usuario`, `tipo_alcance`, `descripcion`, `estado`) VALUES
  (1, 'SysAdmin', 'Administrador del sistema', 'SISTEMA', 'SISTEMA', 'Administración técnica y recuperación de la plataforma', 'ACTIVO'),
  (2, 'AdminEmpresa', 'Administrador general', 'EMPRESA', 'EMPRESA', 'Administración corporativa de MyG Express', 'ACTIVO'),
  (3, 'EncargadoOficina', 'Encargado de oficina', 'EMPRESA', 'SEDE', 'Operación diaria limitada a la sede asignada', 'ACTIVO');

INSERT INTO `permisos` (`id`, `codigo`, `modulo`, `accion`, `nombre`, `descripcion`, `estado`) VALUES
  (1, 'admin.panel.ver', 'ADMIN', 'VER', 'Ver panel central', NULL, 'ACTIVO'),
  (2, 'sedes.gestionar', 'ADMIN', 'GESTIONAR', 'Gestionar sedes', NULL, 'ACTIVO'),
  (3, 'usuarios.gestionar', 'ADMIN', 'GESTIONAR', 'Gestionar usuarios', NULL, 'ACTIVO'),
  (4, 'colas.ver', 'ADMIN', 'VER', 'Consultar colas del sistema', NULL, 'ACTIVO'),
  (5, 'dashboard.ver', 'OPERACION', 'VER', 'Ver panel operativo', NULL, 'ACTIVO'),
  (6, 'rutas.ver', 'RUTAS', 'VER', 'Consultar rutas', NULL, 'ACTIVO'),
  (7, 'rutas.gestionar', 'RUTAS', 'GESTIONAR', 'Gestionar rutas', NULL, 'ACTIVO'),
  (8, 'avisos.ver', 'WHATSAPP', 'VER', 'Consultar avisos', NULL, 'ACTIVO'),
  (9, 'avisos.gestionar', 'WHATSAPP', 'GESTIONAR', 'Gestionar avisos', NULL, 'ACTIVO'),
  (10, 'entregas.ver', 'ENTREGAS', 'VER', 'Consultar entregas', NULL, 'ACTIVO'),
  (11, 'entregas.gestionar', 'ENTREGAS', 'GESTIONAR', 'Gestionar entregas', NULL, 'ACTIVO'),
  (12, 'plantillas.ver', 'WHATSAPP', 'VER', 'Consultar plantillas', NULL, 'ACTIVO'),
  (13, 'plantillas.gestionar', 'WHATSAPP', 'GESTIONAR', 'Gestionar plantillas', NULL, 'ACTIVO'),
  (14, 'whatsapp.ver', 'WHATSAPP', 'VER', 'Consultar sesiones de WhatsApp', NULL, 'ACTIVO'),
  (15, 'whatsapp.gestionar', 'WHATSAPP', 'GESTIONAR', 'Gestionar WhatsApp', NULL, 'ACTIVO'),
  (16, 'urbano.rutas.ver', 'URBANO', 'VER', 'Consultar rutas de Urbano', NULL, 'ACTIVO'),
  (17, 'urbano.rutas.gestionar', 'URBANO', 'GESTIONAR', 'Gestionar rutas de Urbano', NULL, 'ACTIVO'),
  (18, 'savarscan.ver', 'SAVAR_SCAN', 'VER', 'Consultar SAVAR SCAN', NULL, 'ACTIVO'),
  (19, 'savarscan.gestionar', 'SAVAR_SCAN', 'GESTIONAR', 'Gestionar SAVAR SCAN', NULL, 'ACTIVO'),
  (20, 'etiquetas.ver', 'ETIQUETAS', 'GENERAR', 'Generar etiquetas', NULL, 'ACTIVO'),
  (21, 'rrhh.ver', 'RRHH', 'VER', 'Consultar Recursos Humanos', NULL, 'ACTIVO'),
  (22, 'rrhh.gestionar', 'RRHH', 'GESTIONAR', 'Gestionar Recursos Humanos', NULL, 'ACTIVO'),
  (23, 'rrhh.configurar', 'RRHH', 'CONFIGURAR', 'Configurar Recursos Humanos', NULL, 'ACTIVO'),
  (24, 'gps.ver', 'GPS', 'VER', 'Consultar rastreo GPS', NULL, 'ACTIVO'),
  (25, 'gps.gestionar', 'GPS', 'GESTIONAR', 'Gestionar rastreo GPS', NULL, 'ACTIVO');

INSERT INTO `rol_permisos` (`rol_id`, `permiso_id`) VALUES
  (1, 1),
  (1, 2),
  (1, 3),
  (1, 4),
  (1, 5),
  (1, 6),
  (1, 7),
  (1, 8),
  (1, 9),
  (1, 10),
  (1, 11),
  (1, 12),
  (1, 13),
  (1, 14),
  (1, 15),
  (1, 16),
  (1, 17),
  (1, 18),
  (1, 19),
  (1, 20),
  (1, 21),
  (1, 22),
  (1, 23),
  (1, 24),
  (1, 25),
  (2, 5),
  (2, 6),
  (2, 7),
  (2, 8),
  (2, 9),
  (2, 10),
  (2, 11),
  (2, 12),
  (2, 13),
  (2, 14),
  (2, 15),
  (2, 16),
  (2, 17),
  (2, 18),
  (2, 19),
  (2, 20),
  (2, 21),
  (2, 22),
  (2, 23),
  (2, 24),
  (2, 25),
  (3, 5),
  (3, 6),
  (3, 7),
  (3, 8),
  (3, 9),
  (3, 10),
  (3, 11),
  (3, 12),
  (3, 13),
  (3, 14),
  (3, 15),
  (3, 16),
  (3, 17),
  (3, 18),
  (3, 19),
  (3, 20);
