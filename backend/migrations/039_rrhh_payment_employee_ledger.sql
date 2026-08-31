-- MariaDB 10.4+. Notas auditables del expediente mensual de pagos por colaborador.

CREATE TABLE IF NOT EXISTS personal_pago_notas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  empresa_id INT UNSIGNED NOT NULL,
  empleado_id INT UNSIGNED NOT NULL,
  periodo DATE NOT NULL COMMENT 'Primer dia del mes al que corresponde la nota',
  nota VARCHAR(800) NOT NULL,
  monto_referencial DECIMAL(12,2) NULL,
  estado ENUM('ACTIVA','ANULADA') NOT NULL DEFAULT 'ACTIVA',
  creado_por INT UNSIGNED NOT NULL,
  anulado_por INT UNSIGNED NULL,
  motivo_anulacion VARCHAR(300) NULL,
  anulado_en DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_personal_pago_notas_expediente (empresa_id, empleado_id, periodo, estado, created_at),
  CONSTRAINT fk_personal_pago_nota_empresa FOREIGN KEY (empresa_id)
    REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_pago_nota_empleado FOREIGN KEY (empleado_id)
    REFERENCES personal_empleados(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_pago_nota_creador FOREIGN KEY (creado_por)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_personal_pago_nota_anulador FOREIGN KEY (anulado_por)
    REFERENCES usuarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_personal_pago_nota_periodo CHECK (DAY(periodo) = 1),
  CONSTRAINT chk_personal_pago_nota_monto CHECK (monto_referencial IS NULL OR monto_referencial >= 0),
  CONSTRAINT chk_personal_pago_nota_anulacion CHECK (
    (estado = 'ACTIVA' AND anulado_por IS NULL AND motivo_anulacion IS NULL AND anulado_en IS NULL) OR
    (estado = 'ANULADA' AND motivo_anulacion IS NOT NULL AND anulado_en IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
