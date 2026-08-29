-- MariaDB 10.4+. Retencion minima y eliminacion auditable de selfies de contingencia.

ALTER TABLE personal_solicitudes_marcacion
  ADD COLUMN IF NOT EXISTS evidencia_estado ENUM(
    'ACTIVA','PENDIENTE_ELIMINACION','ELIMINADA'
  ) NOT NULL DEFAULT 'ACTIVA' AFTER expira_en,
  ADD COLUMN IF NOT EXISTS evidencia_eliminada_en DATETIME NULL AFTER evidencia_estado;

ALTER TABLE personal_solicitudes_marcacion
  ADD INDEX IF NOT EXISTS idx_personal_solicitud_evidencia (
    evidencia_estado, estado, expira_en
  );

-- Las solicitudes pendientes solo conservan la selfie siete dias desde la captura.
UPDATE personal_solicitudes_marcacion
SET expira_en = DATE_ADD(capturada_en, INTERVAL 7 DAY)
WHERE estado = 'PENDIENTE'
  AND expira_en > DATE_ADD(capturada_en, INTERVAL 7 DAY);

-- Las rechazadas se conservan siete dias desde la decision administrativa.
UPDATE personal_solicitudes_marcacion
SET expira_en = DATE_ADD(COALESCE(revisado_en, updated_at), INTERVAL 7 DAY)
WHERE estado IN ('RECHAZADA', 'CANCELADA')
  AND expira_en > DATE_ADD(COALESCE(revisado_en, updated_at), INTERVAL 7 DAY);

-- Una aprobacion ya no necesita conservar el archivo: el worker completara el borrado fisico.
UPDATE personal_solicitudes_marcacion
SET evidencia_estado = 'PENDIENTE_ELIMINACION', expira_en = NOW()
WHERE estado = 'APROBADA'
  AND evidencia_estado <> 'ELIMINADA';

-- Vencimientos existentes quedan listos para una limpieza idempotente.
UPDATE personal_solicitudes_marcacion
SET estado = 'CANCELADA',
    comentario_revision = COALESCE(comentario_revision, 'Solicitud vencida por politica de retencion.'),
    revisado_en = COALESCE(revisado_en, NOW()),
    evidencia_estado = 'PENDIENTE_ELIMINACION'
WHERE estado = 'PENDIENTE'
  AND expira_en <= NOW();

UPDATE personal_solicitudes_marcacion
SET evidencia_estado = 'PENDIENTE_ELIMINACION'
WHERE estado IN ('RECHAZADA', 'CANCELADA')
  AND expira_en <= NOW()
  AND evidencia_estado = 'ACTIVA';
