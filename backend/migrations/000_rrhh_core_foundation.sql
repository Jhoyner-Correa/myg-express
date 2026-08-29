-- Base instalable de RR. HH. No inserta empleados ni datos de demostración.

CREATE TABLE IF NOT EXISTS personal_cargos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  descripcion VARCHAR(255) NULL,
  tipo_rastreo_defecto ENUM('NINGUNO','SOLO_MARCACION','CONTINUO') NOT NULL DEFAULT 'SOLO_MARCACION',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_cargos_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_horarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  hora_entrada TIME NOT NULL,
  hora_salida TIME NOT NULL,
  tolerancia_minutos INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_empleados (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo_empleado VARCHAR(20) NOT NULL,
  sede_id INT UNSIGNED NOT NULL,
  cargo_id INT UNSIGNED NOT NULL,
  dni VARCHAR(15) NOT NULL,
  nombres VARCHAR(100) NOT NULL,
  apellidos VARCHAR(100) NOT NULL,
  sexo ENUM('M','F') NOT NULL,
  telefono VARCHAR(20) NULL,
  email VARCHAR(100) NULL,
  fecha_ingreso DATE NOT NULL,
  fecha_cese DATE NULL,
  tipo_rastreo ENUM('NINGUNO','SOLO_MARCACION','CONTINUO') NOT NULL DEFAULT 'SOLO_MARCACION',
  estado ENUM('ACTIVO','INACTIVO','SUSPENDIDO') NOT NULL DEFAULT 'ACTIVO',
  observaciones TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_personal_emp_codigo (codigo_empleado),
  UNIQUE KEY idx_personal_emp_dni (dni),
  KEY idx_personal_emp_sede (sede_id),
  KEY idx_personal_emp_fecha_ing (fecha_ingreso),
  KEY fk_personal_emp_cargo (cargo_id),
  CONSTRAINT fk_personal_emp_cargo FOREIGN KEY (cargo_id) REFERENCES personal_cargos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_emp_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_configuracion_gps_sedes (
  sede_id INT UNSIGNED NOT NULL,
  latitud DECIMAL(10,8) NOT NULL,
  longitud DECIMAL(11,8) NOT NULL,
  radio_permitido_metros INT NOT NULL DEFAULT 50,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (sede_id),
  CONSTRAINT fk_personal_cfg_gps_sede FOREIGN KEY (sede_id) REFERENCES sedes(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_empleado_horarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  horario_id INT UNSIGNED NOT NULL,
  dia_semana TINYINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_personal_emp_hor_dia (empleado_id, dia_semana),
  KEY idx_personal_emp_hor_horario (horario_id),
  CONSTRAINT fk_personal_emp_hor_empleado FOREIGN KEY (empleado_id) REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_emp_hor_horario FOREIGN KEY (horario_id) REFERENCES personal_horarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_asistencias (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  fecha DATE NOT NULL,
  estado_asistencia ENUM('PRESENTE','TARDANZA','FALTA','PERMISO','VACACIONES') NOT NULL DEFAULT 'PRESENTE',
  tipo_asistencia ENUM('NORMAL','REMOTA','COMISION','VISITA') NOT NULL DEFAULT 'NORMAL',
  minutos_tardanza INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_personal_asist_emp_fecha (empleado_id, fecha),
  KEY idx_personal_asist_fecha (fecha),
  CONSTRAINT fk_personal_asist_emp FOREIGN KEY (empleado_id) REFERENCES personal_empleados(id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_dispositivos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  firebase_token TEXT NULL,
  marca VARCHAR(100) NULL,
  modelo VARCHAR(100) NULL,
  version_android VARCHAR(50) NULL,
  version_app VARCHAR(50) NULL,
  estado ENUM('AUTORIZADO','BLOQUEADO','PENDIENTE') NOT NULL DEFAULT 'PENDIENTE',
  ultimo_acceso DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY idx_personal_disp_uid (device_id),
  KEY idx_personal_disp_empleado (empleado_id),
  CONSTRAINT fk_personal_disp_emp FOREIGN KEY (empleado_id) REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_marcaciones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  asistencia_id INT UNSIGNED NOT NULL,
  dispositivo_id INT UNSIGNED NULL,
  tipo_marcacion ENUM('ENTRADA','SALIDA_ALMUERZO','REGRESO','SALIDA') NOT NULL,
  origen_marcacion ENUM('GPS','QR','NFC','BIOMETRICO','ADMINISTRATIVO') NOT NULL DEFAULT 'GPS',
  hora_marcacion DATETIME NOT NULL,
  latitud DECIMAL(10,8) NOT NULL,
  longitud DECIMAL(11,8) NOT NULL,
  precision_gps DECIMAL(6,2) NULL,
  selfie_path VARCHAR(255) NULL,
  red_wifi VARCHAR(100) NULL,
  bluetooth VARCHAR(100) NULL,
  dentro_de_radio TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_marc_hora (hora_marcacion),
  KEY fk_personal_marc_asist (asistencia_id),
  KEY fk_personal_marc_disp (dispositivo_id),
  CONSTRAINT fk_personal_marc_asist FOREIGN KEY (asistencia_id) REFERENCES personal_asistencias(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_marc_disp FOREIGN KEY (dispositivo_id) REFERENCES personal_dispositivos(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_acceso_app (
  empleado_id INT UNSIGNED NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  requiere_cambio_clave TINYINT(1) NOT NULL DEFAULT 1,
  token_actual VARCHAR(500) NULL,
  refresh_token VARCHAR(500) NULL,
  ultimo_login DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (empleado_id),
  CONSTRAINT fk_personal_acceso_emp FOREIGN KEY (empleado_id) REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_gps_tiempo_real (
  empleado_id INT UNSIGNED NOT NULL,
  latitud DECIMAL(10,8) NOT NULL,
  longitud DECIMAL(11,8) NOT NULL,
  velocidad_kmh DECIMAL(5,2) NOT NULL DEFAULT 0,
  precision_gps DECIMAL(6,2) NULL,
  altitud DECIMAL(7,2) NULL,
  rumbo DECIMAL(5,2) NULL,
  estado_movimiento ENUM('DETENIDO','CAMINANDO','VEHICULO') NOT NULL DEFAULT 'DETENIDO',
  porcentaje_bateria TINYINT NULL,
  ultima_actualizacion DATETIME NOT NULL,
  PRIMARY KEY (empleado_id),
  CONSTRAINT fk_personal_gps_tr_emp FOREIGN KEY (empleado_id) REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_gps_historial (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  latitud DECIMAL(10,8) NOT NULL,
  longitud DECIMAL(11,8) NOT NULL,
  velocidad_kmh DECIMAL(5,2) NOT NULL DEFAULT 0,
  precision_gps DECIMAL(6,2) NULL,
  altitud DECIMAL(7,2) NULL,
  rumbo DECIMAL(5,2) NULL,
  estado_movimiento ENUM('DETENIDO','CAMINANDO','VEHICULO') NOT NULL DEFAULT 'DETENIDO',
  porcentaje_bateria TINYINT NULL,
  registrado_en DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_personal_gps_hist_emp_fecha (empleado_id, registrado_en),
  CONSTRAINT fk_personal_gps_hist_emp FOREIGN KEY (empleado_id) REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_solicitudes_permisos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  tipo_permiso ENUM('MEDICO','PERSONAL','FAMILIAR','OTRO') NOT NULL,
  fecha_inicio DATETIME NOT NULL,
  fecha_fin DATETIME NOT NULL,
  motivo TEXT NOT NULL,
  estado ENUM('PENDIENTE','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  aprobado_por INT UNSIGNED NULL,
  comentario_resolucion VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_personal_perm_emp (empleado_id),
  KEY fk_personal_perm_aprob (aprobado_por),
  CONSTRAINT fk_personal_perm_emp FOREIGN KEY (empleado_id) REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_personal_perm_aprob FOREIGN KEY (aprobado_por) REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_vacaciones (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  periodo_anio YEAR NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  dias_tomados INT NOT NULL,
  motivo VARCHAR(500) NULL,
  estado ENUM('SOLICITADA','APROBADA','RECHAZADA','PROGRAMADA','EN_CURSO','COMPLETADA') NOT NULL DEFAULT 'SOLICITADA',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY fk_personal_vac_emp (empleado_id),
  CONSTRAINT fk_personal_vac_emp FOREIGN KEY (empleado_id) REFERENCES personal_empleados(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
