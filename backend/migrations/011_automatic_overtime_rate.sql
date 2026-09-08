-- Cálculo trazable de la tarifa de horas extra.

SET @tarifa_modo_existe = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'personal_pago_acuerdos'
    AND COLUMN_NAME = 'tarifa_hora_extra_modo'
);
SET @tarifa_modo_ddl = IF(
  @tarifa_modo_existe = 0,
  'ALTER TABLE personal_pago_acuerdos ADD COLUMN tarifa_hora_extra_modo ENUM(''AUTOMATICA'',''MANUAL'') NOT NULL DEFAULT ''MANUAL'' AFTER tarifa_hora_extra',
  'SELECT 1'
);
PREPARE tarifa_modo_stmt FROM @tarifa_modo_ddl;
EXECUTE tarifa_modo_stmt;
DEALLOCATE PREPARE tarifa_modo_stmt;

UPDATE personal_pago_acuerdos
SET tarifa_hora_extra_modo = 'AUTOMATICA'
WHERE tarifa_hora_extra = 0;

SET @tarifa_aplicada_existe = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'personal_liquidaciones_pago'
    AND COLUMN_NAME = 'tarifa_hora_extra_aplicada'
);
SET @tarifa_aplicada_ddl = IF(
  @tarifa_aplicada_existe = 0,
  'ALTER TABLE personal_liquidaciones_pago ADD COLUMN tarifa_hora_extra_aplicada DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER minutos_horas_extra',
  'SELECT 1'
);
PREPARE tarifa_aplicada_stmt FROM @tarifa_aplicada_ddl;
EXECUTE tarifa_aplicada_stmt;
DEALLOCATE PREPARE tarifa_aplicada_stmt;

UPDATE personal_liquidaciones_pago liquidation
LEFT JOIN personal_pago_acuerdos agreement ON agreement.id = liquidation.acuerdo_id
SET liquidation.tarifa_hora_extra_aplicada = CASE
  WHEN liquidation.minutos_horas_extra > 0 AND liquidation.monto_horas_extra > 0
    THEN ROUND(liquidation.monto_horas_extra / (liquidation.minutos_horas_extra / 60), 2)
  WHEN agreement.tarifa_hora_extra_modo = 'MANUAL'
    THEN agreement.tarifa_hora_extra
  ELSE ROUND(liquidation.honorario_mensual_pactado / liquidation.dias_periodo / 8, 2)
END;
