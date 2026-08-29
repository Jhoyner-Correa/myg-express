-- Evita registrar dos veces el mismo RHE para un colaborador.
ALTER TABLE personal_liquidaciones_pago
  ADD UNIQUE KEY IF NOT EXISTS uq_personal_liquidacion_rhe (empleado_id, rhe_serie, rhe_numero);
