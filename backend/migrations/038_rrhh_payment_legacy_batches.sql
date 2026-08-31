-- Conserva pagos anteriores al workflow agrupandolos en lotes historicos auditables.
INSERT INTO personal_lotes_pago (
  empresa_id, periodo_pago_id, codigo, estado, cantidad_pagos,
  total_depositar, creado_por, procesado_por, procesado_en, observacion
)
SELECT period.empresa_id, period.id, CONCAT('LEGACY-', LPAD(period.id, 6, '0')), 'PAGADO',
       COUNT(liquidation.id), SUM(liquidation.total_depositar),
       NULL, MAX(liquidation.pagado_por), MAX(liquidation.pago_fecha),
       'Migrado automaticamente desde pagos registrados antes del workflow por lotes.'
  FROM personal_periodos_pago period
  INNER JOIN personal_liquidaciones_pago liquidation
    ON liquidation.periodo_pago_id = period.id AND liquidation.estado = 'PAGADO'
  LEFT JOIN personal_lote_pago_detalles detail ON detail.liquidacion_id = liquidation.id
 WHERE detail.id IS NULL
 GROUP BY period.empresa_id, period.id
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id);

INSERT INTO personal_lote_pago_detalles (
  lote_pago_id, liquidacion_id, monto, estado, numero_operacion, pagado_en,
  observacion
)
SELECT batch.id, liquidation.id, liquidation.total_depositar, 'PAGADO',
       liquidation.pago_operacion, liquidation.pago_fecha,
       'Pago historico incorporado al modelo de lotes.'
  FROM personal_liquidaciones_pago liquidation
  INNER JOIN personal_periodos_pago period ON period.id = liquidation.periodo_pago_id
  INNER JOIN personal_lotes_pago batch
    ON batch.periodo_pago_id = period.id
   AND batch.codigo = CONCAT('LEGACY-', LPAD(period.id, 6, '0'))
  LEFT JOIN personal_lote_pago_detalles detail ON detail.liquidacion_id = liquidation.id
 WHERE liquidation.estado = 'PAGADO' AND detail.id IS NULL;
