-- MariaDB 10.4+. Politica de honorarios para meses parciales y snapshot auditable.

ALTER TABLE personal_pago_acuerdos
  ADD COLUMN IF NOT EXISTS politica_prorrateo ENUM('DIAS_CALENDARIO','HONORARIO_COMPLETO')
    NOT NULL DEFAULT 'DIAS_CALENDARIO' AFTER pago_mensual;

ALTER TABLE personal_liquidaciones_pago
  ADD COLUMN IF NOT EXISTS honorario_mensual_pactado DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER pago_mensual,
  ADD COLUMN IF NOT EXISTS politica_prorrateo ENUM('DIAS_CALENDARIO','HONORARIO_COMPLETO')
    NOT NULL DEFAULT 'DIAS_CALENDARIO' AFTER honorario_mensual_pactado,
  ADD COLUMN IF NOT EXISTS prorrateo_aplicado TINYINT(1) NOT NULL DEFAULT 0 AFTER politica_prorrateo,
  ADD COLUMN IF NOT EXISTS dias_periodo TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER prorrateo_aplicado,
  ADD COLUMN IF NOT EXISTS dias_servicio TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER dias_periodo,
  ADD COLUMN IF NOT EXISTS fecha_servicio_desde DATE NULL AFTER dias_servicio,
  ADD COLUMN IF NOT EXISTS fecha_servicio_hasta DATE NULL AFTER fecha_servicio_desde,
  ADD COLUMN IF NOT EXISTS factor_prorrateo DECIMAL(9,8) NOT NULL DEFAULT 1.00000000 AFTER fecha_servicio_hasta;

UPDATE personal_liquidaciones_pago liquidation
INNER JOIN personal_periodos_pago payment_period ON payment_period.id = liquidation.periodo_pago_id
SET liquidation.honorario_mensual_pactado = liquidation.pago_mensual,
    liquidation.politica_prorrateo = 'HONORARIO_COMPLETO',
    liquidation.prorrateo_aplicado = 0,
    liquidation.dias_periodo = DAY(LAST_DAY(payment_period.periodo)),
    liquidation.dias_servicio = DAY(LAST_DAY(payment_period.periodo)),
    liquidation.fecha_servicio_desde = payment_period.periodo,
    liquidation.fecha_servicio_hasta = LAST_DAY(payment_period.periodo),
    liquidation.factor_prorrateo = 1.00000000
WHERE liquidation.dias_periodo = 0 OR liquidation.dias_servicio = 0;
