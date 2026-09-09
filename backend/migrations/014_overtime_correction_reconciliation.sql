-- Conserva la trazabilidad cuando una correccion administrativa invalida horas extra.
ALTER TABLE personal_sobretiempo_solicitudes
  MODIFY estado enum('PENDIENTE','APROBADO','RECHAZADO','ANULADO')
  NOT NULL DEFAULT 'PENDIENTE',
  ADD COLUMN anulado_por int(10) unsigned DEFAULT NULL AFTER revisado_en,
  ADD COLUMN motivo_anulacion varchar(500) DEFAULT NULL AFTER anulado_por,
  ADD COLUMN anulado_en datetime DEFAULT NULL AFTER motivo_anulacion,
  ADD KEY idx_personal_sobretiempo_anulador (anulado_por),
  ADD CONSTRAINT fk_personal_sobretiempo_anulador
    FOREIGN KEY (anulado_por) REFERENCES usuarios (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
