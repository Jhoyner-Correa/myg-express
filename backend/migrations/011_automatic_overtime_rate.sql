-- Cálculo trazable de la tarifa de horas extra.

ALTER TABLE personal_pago_acuerdos
  ADD COLUMN IF NOT EXISTS tarifa_hora_extra_modo ENUM('AUTOMATICA','MANUAL') NOT NULL DEFAULT 'MANUAL'
  AFTER tarifa_hora_extra;

UPDATE personal_pago_acuerdos
SET tarifa_hora_extra_modo = 'AUTOMATICA'
WHERE tarifa_hora_extra = 0;

ALTER TABLE personal_liquidaciones_pago
  ADD COLUMN IF NOT EXISTS tarifa_hora_extra_aplicada DECIMAL(10,2) NOT NULL DEFAULT 0
  AFTER minutos_horas_extra;

UPDATE personal_liquidaciones_pago liquidation
LEFT JOIN personal_pago_acuerdos agreement ON agreement.id = liquidation.acuerdo_id
SET liquidation.tarifa_hora_extra_aplicada = CASE
  WHEN liquidation.minutos_horas_extra > 0 AND liquidation.monto_horas_extra > 0
    THEN ROUND(liquidation.monto_horas_extra / (liquidation.minutos_horas_extra / 60), 2)
  WHEN agreement.tarifa_hora_extra_modo = 'MANUAL'
    THEN agreement.tarifa_hora_extra
  ELSE ROUND(liquidation.honorario_mensual_pactado / liquidation.dias_periodo / 8, 2)
END;
