-- MariaDB 10.4+. Flujo corporativo para revision, aprobacion y pago por lotes.

ALTER TABLE personal_periodos_pago
  MODIFY estado ENUM('BORRADOR','EN_REVISION','APROBADO','EN_PAGO','PAGADO','CERRADO') NOT NULL DEFAULT 'BORRADOR',
  ADD COLUMN IF NOT EXISTS enviado_revision_por INT UNSIGNED NULL AFTER generado_por,
  ADD COLUMN IF NOT EXISTS enviado_revision_en DATETIME NULL AFTER enviado_revision_por,
  ADD COLUMN IF NOT EXISTS cerrado_por INT UNSIGNED NULL AFTER aprobado_en,
  ADD COLUMN IF NOT EXISTS observacion VARCHAR(500) NULL AFTER cerrado_en,
  ADD KEY IF NOT EXISTS idx_personal_periodo_pago_estado (empresa_id, estado, periodo),
  ADD CONSTRAINT fk_personal_periodo_pago_revisor FOREIGN KEY (enviado_revision_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_personal_periodo_pago_cierre FOREIGN KEY (cerrado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE personal_liquidaciones_pago
  MODIFY estado ENUM(
    'CONFIGURACION_PENDIENTE','BORRADOR','OBSERVADO','LISTO_PARA_PAGO',
    'EN_REVISION','APROBADO','EN_LOTE','PAGADO'
  ) NOT NULL DEFAULT 'BORRADOR',
  ADD COLUMN IF NOT EXISTS rhe_importe DECIMAL(12,2) NULL AFTER rhe_fecha_emision,
  ADD COLUMN IF NOT EXISTS aprobado_por INT UNSIGNED NULL AFTER rhe_importe,
  ADD COLUMN IF NOT EXISTS aprobado_en DATETIME NULL AFTER aprobado_por,
  ADD KEY IF NOT EXISTS idx_personal_liquidacion_periodo_estado (periodo_pago_id, estado),
  ADD UNIQUE KEY IF NOT EXISTS uq_personal_liquidacion_rhe (empleado_id, rhe_serie, rhe_numero),
  ADD CONSTRAINT fk_personal_liquidacion_aprobador FOREIGN KEY (aprobado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS personal_lotes_pago (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id INT UNSIGNED NOT NULL,
  periodo_pago_id BIGINT UNSIGNED NOT NULL,
  codigo VARCHAR(32) NOT NULL,
  estado ENUM('BORRADOR','EN_PROCESO','PAGADO','CANCELADO') NOT NULL DEFAULT 'BORRADOR',
  cantidad_pagos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  total_depositar DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  creado_por INT UNSIGNED NULL,
  procesado_por INT UNSIGNED NULL,
  procesado_en DATETIME NULL,
  observacion VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_lote_pago_codigo (empresa_id, codigo),
  KEY idx_personal_lote_pago_periodo (periodo_pago_id, estado),
  CONSTRAINT fk_personal_lote_pago_empresa FOREIGN KEY (empresa_id)
    REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_lote_pago_periodo FOREIGN KEY (periodo_pago_id)
    REFERENCES personal_periodos_pago(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_lote_pago_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_personal_lote_pago_procesador FOREIGN KEY (procesado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_personal_lote_pago_total CHECK (cantidad_pagos >= 0 AND total_depositar >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_lote_pago_detalles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  lote_pago_id BIGINT UNSIGNED NOT NULL,
  liquidacion_id BIGINT UNSIGNED NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  estado ENUM('PENDIENTE','PAGADO','FALLIDO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  numero_operacion VARCHAR(80) NULL,
  pagado_en DATETIME NULL,
  observacion VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_personal_lote_detalle_liquidacion (liquidacion_id),
  KEY idx_personal_lote_detalle_estado (lote_pago_id, estado),
  CONSTRAINT fk_personal_lote_detalle_lote FOREIGN KEY (lote_pago_id)
    REFERENCES personal_lotes_pago(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_lote_detalle_liquidacion FOREIGN KEY (liquidacion_id)
    REFERENCES personal_liquidaciones_pago(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_personal_lote_detalle_monto CHECK (monto >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_pago_transiciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id INT UNSIGNED NOT NULL,
  entidad ENUM('PERIODO','LIQUIDACION','LOTE') NOT NULL,
  entidad_id BIGINT UNSIGNED NOT NULL,
  estado_anterior VARCHAR(40) NULL,
  estado_nuevo VARCHAR(40) NOT NULL,
  motivo VARCHAR(500) NULL,
  usuario_id INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_pago_transicion_entidad (entidad, entidad_id, created_at),
  KEY idx_personal_pago_transicion_empresa (empresa_id, created_at),
  CONSTRAINT fk_personal_pago_transicion_empresa FOREIGN KEY (empresa_id)
    REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_pago_transicion_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
