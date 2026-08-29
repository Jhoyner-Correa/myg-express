-- MariaDB 10.4+. Pagos mensuales por servicios (Recibos por Honorarios).
-- Los importes se congelan por periodo para conservar trazabilidad financiera.

CREATE TABLE IF NOT EXISTS personal_pago_acuerdos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  pago_mensual DECIMAL(12,2) NOT NULL,
  tarifa_hora_extra DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  banco VARCHAR(100) NULL,
  tipo_cuenta ENUM('AHORROS','CORRIENTE') NULL,
  numero_cuenta VARCHAR(512) NULL COMMENT 'Valor cifrado por la aplicacion',
  numero_cuenta_ultimos4 CHAR(4) NULL,
  cci VARCHAR(512) NULL COMMENT 'Valor cifrado por la aplicacion',
  cci_ultimos4 CHAR(4) NULL,
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE NULL,
  creado_por INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  acuerdo_activo INT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN vigente_hasta IS NULL THEN empleado_id ELSE NULL END
  ) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_pago_acuerdo_activo (acuerdo_activo),
  KEY idx_personal_pago_acuerdo_vigencia (empleado_id, vigente_desde, vigente_hasta),
  CONSTRAINT fk_personal_pago_acuerdo_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_pago_acuerdo_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_pago_acuerdo_importes CHECK (pago_mensual >= 0 AND tarifa_hora_extra >= 0),
  CONSTRAINT chk_personal_pago_acuerdo_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_pago_movimientos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  periodo DATE NOT NULL COMMENT 'Primer dia del mes de aplicacion',
  tipo ENUM('ADELANTO','OTRO_INGRESO','OTRO_DESCUENTO') NOT NULL,
  concepto VARCHAR(160) NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  estado ENUM('PENDIENTE','APLICADO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  creado_por INT UNSIGNED NULL,
  aplicado_en DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_pago_movimiento_periodo (periodo, estado, empleado_id),
  CONSTRAINT fk_personal_pago_movimiento_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_pago_movimiento_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_pago_movimiento_monto CHECK (monto > 0),
  CONSTRAINT chk_personal_pago_movimiento_periodo CHECK (DAY(periodo) = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_prestamos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empleado_id INT UNSIGNED NOT NULL,
  concepto VARCHAR(160) NOT NULL,
  monto_original DECIMAL(12,2) NOT NULL,
  saldo_pendiente DECIMAL(12,2) NOT NULL,
  cuota_mensual DECIMAL(12,2) NOT NULL,
  periodo_inicio DATE NOT NULL,
  estado ENUM('ACTIVO','PAGADO','CANCELADO') NOT NULL DEFAULT 'ACTIVO',
  creado_por INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_prestamo_activo (empleado_id, estado, periodo_inicio),
  CONSTRAINT fk_personal_prestamo_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_prestamo_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_prestamo_importes CHECK (
    monto_original > 0 AND saldo_pendiente >= 0 AND saldo_pendiente <= monto_original
    AND cuota_mensual > 0 AND cuota_mensual <= monto_original
  ),
  CONSTRAINT chk_personal_prestamo_periodo CHECK (DAY(periodo_inicio) = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_periodos_pago (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id INT UNSIGNED NOT NULL,
  periodo DATE NOT NULL COMMENT 'Primer dia del mes liquidado',
  estado ENUM('BORRADOR','EN_REVISION','APROBADO','PAGADO','CERRADO') NOT NULL DEFAULT 'BORRADOR',
  generado_por INT UNSIGNED NULL,
  aprobado_por INT UNSIGNED NULL,
  aprobado_en DATETIME NULL,
  cerrado_en DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_periodo_pago (empresa_id, periodo),
  CONSTRAINT fk_personal_periodo_pago_empresa FOREIGN KEY (empresa_id)
    REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_periodo_pago_generador FOREIGN KEY (generado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_personal_periodo_pago_aprobador FOREIGN KEY (aprobado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_periodo_pago_mes CHECK (DAY(periodo) = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_liquidaciones_pago (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  periodo_pago_id BIGINT UNSIGNED NOT NULL,
  empleado_id INT UNSIGNED NOT NULL,
  sede_id INT UNSIGNED NOT NULL,
  acuerdo_id BIGINT UNSIGNED NULL,
  pago_mensual DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  minutos_horas_extra SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  monto_horas_extra DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  otros_ingresos DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  adelantos DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  cuotas_prestamo DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  otros_descuentos DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_servicio DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Importe bruto del RHE',
  total_depositar DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  estado ENUM('CONFIGURACION_PENDIENTE','BORRADOR','LISTO_PARA_PAGO','PAGADO','OBSERVADO') NOT NULL DEFAULT 'BORRADOR',
  rhe_serie VARCHAR(8) NULL,
  rhe_numero VARCHAR(20) NULL,
  rhe_fecha_emision DATE NULL,
  pago_fecha DATETIME NULL,
  pago_operacion VARCHAR(80) NULL,
  pago_banco VARCHAR(100) NULL,
  pago_cuenta_ultimos4 CHAR(4) NULL,
  pagado_por INT UNSIGNED NULL,
  observacion VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_liquidacion_periodo_empleado (periodo_pago_id, empleado_id),
  KEY idx_personal_liquidacion_sede_estado (sede_id, estado),
  CONSTRAINT fk_personal_liquidacion_periodo FOREIGN KEY (periodo_pago_id)
    REFERENCES personal_periodos_pago(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_liquidacion_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_liquidacion_sede FOREIGN KEY (sede_id)
    REFERENCES sedes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_liquidacion_acuerdo FOREIGN KEY (acuerdo_id)
    REFERENCES personal_pago_acuerdos(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_liquidacion_pagador FOREIGN KEY (pagado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_liquidacion_importes CHECK (
    pago_mensual >= 0 AND monto_horas_extra >= 0 AND otros_ingresos >= 0
    AND adelantos >= 0 AND cuotas_prestamo >= 0 AND otros_descuentos >= 0
    AND total_servicio >= 0 AND total_depositar >= 0
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_liquidacion_conceptos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  liquidacion_id BIGINT UNSIGNED NOT NULL,
  tipo ENUM('PAGO_MENSUAL','HORAS_EXTRA','OTRO_INGRESO','ADELANTO','CUOTA_PRESTAMO','OTRO_DESCUENTO') NOT NULL,
  descripcion VARCHAR(180) NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  cantidad DECIMAL(12,2) NULL,
  unidad VARCHAR(20) NULL,
  origen_tipo VARCHAR(50) NULL,
  origen_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_liquidacion_conceptos (liquidacion_id, tipo),
  UNIQUE KEY uq_personal_liquidacion_origen (liquidacion_id, origen_tipo, origen_id),
  CONSTRAINT fk_personal_liquidacion_concepto FOREIGN KEY (liquidacion_id)
    REFERENCES personal_liquidaciones_pago(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_personal_liquidacion_concepto_monto CHECK (monto >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
