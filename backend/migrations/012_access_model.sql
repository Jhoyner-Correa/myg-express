-- MariaDB 10.4+. Modelo normalizado de usuarios, roles, permisos y alcance.
-- La migracion es aditiva: las columnas antiguas se conservan temporalmente
-- para permitir un despliegue gradual y una reversión segura.

CREATE TABLE IF NOT EXISTS empresas (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(40) NOT NULL,
  razon_social VARCHAR(160) NULL,
  ruc CHAR(11) NULL,
  nombre_comercial VARCHAR(120) NOT NULL,
  zona_horaria VARCHAR(60) NOT NULL DEFAULT 'America/Lima',
  estado ENUM('ACTIVA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_empresas_codigo (codigo),
  UNIQUE KEY uq_empresas_ruc (ruc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO empresas (codigo, razon_social, ruc, nombre_comercial)
VALUES ('MYG_EXPRESS', NULL, NULL, 'MyG Express')
ON DUPLICATE KEY UPDATE nombre_comercial = VALUES(nombre_comercial);

ALTER TABLE sedes
  ADD COLUMN IF NOT EXISTS empresa_id INT UNSIGNED NULL AFTER id;

UPDATE sedes
SET empresa_id = (SELECT id FROM empresas WHERE codigo = 'MYG_EXPRESS' LIMIT 1)
WHERE empresa_id IS NULL;

ALTER TABLE sedes
  MODIFY COLUMN empresa_id INT UNSIGNED NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sedes_empresa_estado ON sedes (empresa_id, estado);

ALTER TABLE sedes
  ADD CONSTRAINT fk_sedes_empresa FOREIGN KEY (empresa_id)
    REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS tipo_usuario ENUM('SISTEMA','EMPRESA') NOT NULL DEFAULT 'EMPRESA' AFTER password_hash,
  ADD COLUMN IF NOT EXISTS ultimo_acceso_at DATETIME NULL AFTER estado,
  ADD COLUMN IF NOT EXISTS password_actualizado_at DATETIME NULL AFTER ultimo_acceso_at;

UPDATE usuarios
SET tipo_usuario = CASE
  WHEN rol = 'SysAdmin' OR es_superadmin = 1 THEN 'SISTEMA'
  ELSE 'EMPRESA'
END;

CREATE INDEX IF NOT EXISTS idx_usuarios_tipo_estado ON usuarios (tipo_usuario, estado);
CREATE INDEX IF NOT EXISTS idx_usuarios_ultimo_acceso ON usuarios (ultimo_acceso_at);

CREATE TABLE IF NOT EXISTS roles (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(50) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  tipo_usuario ENUM('SISTEMA','EMPRESA') NOT NULL,
  tipo_alcance ENUM('SISTEMA','EMPRESA','SEDE') NOT NULL,
  descripcion VARCHAR(255) NULL,
  estado ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_codigo (codigo),
  KEY idx_roles_tipo_estado (tipo_usuario, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (codigo, nombre, tipo_usuario, tipo_alcance, descripcion) VALUES
  ('SysAdmin', 'Administrador del sistema', 'SISTEMA', 'SISTEMA', 'Administración técnica y recuperación de la plataforma'),
  ('AdminEmpresa', 'Administrador general', 'EMPRESA', 'EMPRESA', 'Administración corporativa de MyG Express'),
  ('EncargadoOficina', 'Encargado de oficina', 'EMPRESA', 'SEDE', 'Operación diaria limitada a la sede asignada')
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  tipo_usuario = VALUES(tipo_usuario),
  tipo_alcance = VALUES(tipo_alcance),
  descripcion = VALUES(descripcion);

CREATE TABLE IF NOT EXISTS permisos (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(80) NOT NULL,
  modulo VARCHAR(40) NOT NULL,
  accion VARCHAR(40) NOT NULL,
  nombre VARCHAR(120) NOT NULL,
  descripcion VARCHAR(255) NULL,
  estado ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permisos_codigo (codigo),
  KEY idx_permisos_modulo_estado (modulo, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permisos (codigo, modulo, accion, nombre) VALUES
  ('admin.panel.ver', 'ADMIN', 'VER', 'Ver panel central'),
  ('sedes.gestionar', 'ADMIN', 'GESTIONAR', 'Gestionar sedes'),
  ('usuarios.gestionar', 'ADMIN', 'GESTIONAR', 'Gestionar usuarios'),
  ('colas.ver', 'ADMIN', 'VER', 'Consultar colas del sistema'),
  ('dashboard.ver', 'OPERACION', 'VER', 'Ver panel operativo'),
  ('rutas.ver', 'RUTAS', 'VER', 'Consultar rutas'),
  ('rutas.gestionar', 'RUTAS', 'GESTIONAR', 'Gestionar rutas'),
  ('avisos.ver', 'WHATSAPP', 'VER', 'Consultar avisos'),
  ('avisos.gestionar', 'WHATSAPP', 'GESTIONAR', 'Gestionar avisos'),
  ('entregas.ver', 'ENTREGAS', 'VER', 'Consultar entregas'),
  ('entregas.gestionar', 'ENTREGAS', 'GESTIONAR', 'Gestionar entregas'),
  ('plantillas.ver', 'WHATSAPP', 'VER', 'Consultar plantillas'),
  ('plantillas.gestionar', 'WHATSAPP', 'GESTIONAR', 'Gestionar plantillas'),
  ('whatsapp.ver', 'WHATSAPP', 'VER', 'Consultar sesiones de WhatsApp'),
  ('whatsapp.gestionar', 'WHATSAPP', 'GESTIONAR', 'Gestionar WhatsApp'),
  ('urbano.rutas.ver', 'URBANO', 'VER', 'Consultar rutas de Urbano'),
  ('urbano.rutas.gestionar', 'URBANO', 'GESTIONAR', 'Gestionar rutas de Urbano'),
  ('savarscan.ver', 'SAVAR_SCAN', 'VER', 'Consultar SAVAR SCAN'),
  ('savarscan.gestionar', 'SAVAR_SCAN', 'GESTIONAR', 'Gestionar SAVAR SCAN'),
  ('etiquetas.ver', 'ETIQUETAS', 'GENERAR', 'Generar etiquetas'),
  ('rrhh.ver', 'RRHH', 'VER', 'Consultar Recursos Humanos'),
  ('rrhh.gestionar', 'RRHH', 'GESTIONAR', 'Gestionar Recursos Humanos'),
  ('rrhh.configurar', 'RRHH', 'CONFIGURAR', 'Configurar Recursos Humanos'),
  ('gps.ver', 'GPS', 'VER', 'Consultar rastreo GPS'),
  ('gps.gestionar', 'GPS', 'GESTIONAR', 'Gestionar rastreo GPS')
ON DUPLICATE KEY UPDATE
  modulo = VALUES(modulo),
  accion = VALUES(accion),
  nombre = VALUES(nombre);

CREATE TABLE IF NOT EXISTS rol_permisos (
  rol_id SMALLINT UNSIGNED NOT NULL,
  permiso_id SMALLINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rol_id, permiso_id),
  CONSTRAINT fk_rol_permisos_rol FOREIGN KEY (rol_id)
    REFERENCES roles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_rol_permisos_permiso FOREIGN KEY (permiso_id)
    REFERENCES permisos(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT rol.id, permiso.id
FROM roles rol
JOIN permisos permiso
WHERE rol.codigo = 'SysAdmin';

INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT rol.id, permiso.id
FROM roles rol
JOIN permisos permiso
  ON permiso.codigo NOT IN ('admin.panel.ver', 'sedes.gestionar', 'usuarios.gestionar', 'colas.ver')
WHERE rol.codigo = 'AdminEmpresa';

INSERT IGNORE INTO rol_permisos (rol_id, permiso_id)
SELECT rol.id, permiso.id
FROM roles rol
JOIN permisos permiso
  ON permiso.codigo IN (
    'dashboard.ver', 'rutas.ver', 'rutas.gestionar', 'avisos.ver', 'avisos.gestionar',
    'entregas.ver', 'entregas.gestionar', 'plantillas.ver', 'plantillas.gestionar',
    'whatsapp.ver', 'whatsapp.gestionar', 'urbano.rutas.ver', 'urbano.rutas.gestionar',
    'savarscan.ver', 'savarscan.gestionar', 'etiquetas.ver'
  )
WHERE rol.codigo = 'EncargadoOficina';

CREATE TABLE IF NOT EXISTS usuario_asignaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  rol_id SMALLINT UNSIGNED NOT NULL,
  empresa_id INT UNSIGNED NULL,
  sede_id INT UNSIGNED NULL,
  alcance ENUM('SISTEMA','EMPRESA','SEDE') NOT NULL,
  es_principal TINYINT(1) NOT NULL DEFAULT 0,
  estado ENUM('ACTIVA','INACTIVA') NOT NULL DEFAULT 'ACTIVA',
  vigente_desde DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vigente_hasta DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_usuario_asignaciones_usuario (usuario_id, estado),
  KEY idx_usuario_asignaciones_empresa (empresa_id, estado),
  KEY idx_usuario_asignaciones_sede (sede_id, estado),
  CONSTRAINT fk_usuario_asignaciones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_usuario_asignaciones_rol FOREIGN KEY (rol_id)
    REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_usuario_asignaciones_empresa FOREIGN KEY (empresa_id)
    REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_usuario_asignaciones_sede FOREIGN KEY (sede_id)
    REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_usuario_asignacion_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  CONSTRAINT chk_usuario_asignacion_alcance CHECK (
    (alcance = 'SISTEMA' AND empresa_id IS NULL AND sede_id IS NULL)
    OR (alcance = 'EMPRESA' AND empresa_id IS NOT NULL AND sede_id IS NULL)
    OR (alcance = 'SEDE' AND empresa_id IS NOT NULL AND sede_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO usuario_asignaciones (usuario_id, rol_id, empresa_id, sede_id, alcance, es_principal)
SELECT usuario.id, rol.id, NULL, NULL, 'SISTEMA', 1
FROM usuarios usuario
JOIN roles rol ON rol.codigo = 'SysAdmin'
WHERE (usuario.rol = 'SysAdmin' OR usuario.es_superadmin = 1)
  AND NOT EXISTS (
    SELECT 1 FROM usuario_asignaciones asignacion
    WHERE asignacion.usuario_id = usuario.id AND asignacion.es_principal = 1
  );

INSERT INTO usuario_asignaciones (usuario_id, rol_id, empresa_id, sede_id, alcance, es_principal)
SELECT usuario.id, rol.id, empresa.id, NULL, 'EMPRESA', 1
FROM usuarios usuario
JOIN roles rol ON rol.codigo = 'AdminEmpresa'
JOIN empresas empresa ON empresa.codigo = 'MYG_EXPRESS'
WHERE usuario.rol = 'AdminEmpresa' AND usuario.es_superadmin = 0
  AND NOT EXISTS (
    SELECT 1 FROM usuario_asignaciones asignacion
    WHERE asignacion.usuario_id = usuario.id AND asignacion.es_principal = 1
  );

INSERT INTO usuario_asignaciones (usuario_id, rol_id, empresa_id, sede_id, alcance, es_principal)
SELECT usuario.id, rol.id, sede.empresa_id, sede.id, 'SEDE', 1
FROM usuarios usuario
JOIN roles rol ON rol.codigo = 'EncargadoOficina'
JOIN sedes sede ON sede.id = usuario.sede_id
WHERE usuario.rol = 'EncargadoOficina' AND usuario.es_superadmin = 0
  AND NOT EXISTS (
    SELECT 1 FROM usuario_asignaciones asignacion
    WHERE asignacion.usuario_id = usuario.id AND asignacion.es_principal = 1
  );

CREATE TABLE IF NOT EXISTS usuario_permisos (
  usuario_id INT UNSIGNED NOT NULL,
  permiso_id SMALLINT UNSIGNED NOT NULL,
  efecto ENUM('PERMITIR','DENEGAR') NOT NULL,
  motivo VARCHAR(255) NULL,
  vigente_hasta DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, permiso_id),
  CONSTRAINT fk_usuario_permisos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_usuario_permisos_permiso FOREIGN KEY (permiso_id)
    REFERENCES permisos(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Conserva exactamente las restricciones de visibilidad que antes estaban en JSON.
-- Los permisos de acción continúan dependiendo exclusivamente del rol.
INSERT IGNORE INTO usuario_permisos (usuario_id, permiso_id, efecto, motivo)
SELECT usuario.id, permiso.id, 'DENEGAR', 'Migrado desde la configuración anterior del usuario'
FROM usuarios usuario
JOIN usuario_asignaciones asignacion ON asignacion.usuario_id = usuario.id AND asignacion.es_principal = 1
JOIN rol_permisos rol_permiso ON rol_permiso.rol_id = asignacion.rol_id
JOIN permisos permiso ON permiso.id = rol_permiso.permiso_id
WHERE usuario.permisos IS NOT NULL
  AND JSON_VALID(usuario.permisos) = 1
  AND JSON_LENGTH(usuario.permisos) > 0
  AND permiso.codigo IN (
    'admin.panel.ver', 'rutas.ver', 'whatsapp.ver', 'urbano.rutas.ver', 'entregas.ver',
    'etiquetas.ver', 'savarscan.ver', 'rrhh.ver', 'gps.ver'
  )
  AND JSON_CONTAINS(usuario.permisos, JSON_QUOTE(permiso.codigo), '$') = 0;

CREATE TABLE IF NOT EXISTS auditoria_sistema (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_usuario_id INT UNSIGNED NULL,
  evento VARCHAR(80) NOT NULL,
  entidad_tipo VARCHAR(60) NOT NULL,
  entidad_id VARCHAR(80) NULL,
  empresa_id INT UNSIGNED NULL,
  sede_id INT UNSIGNED NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  metadata LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_auditoria_actor_fecha (actor_usuario_id, created_at),
  KEY idx_auditoria_entidad_fecha (entidad_tipo, entidad_id, created_at),
  CONSTRAINT fk_auditoria_actor FOREIGN KEY (actor_usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_auditoria_empresa FOREIGN KEY (empresa_id)
    REFERENCES empresas(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_auditoria_sede FOREIGN KEY (sede_id)
    REFERENCES sedes(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_auditoria_metadata_json CHECK (metadata IS NULL OR JSON_VALID(metadata))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
