-- ============================================================
-- Migración 019: Plantilla de Impresión de Reclamos y Soporte por Sede
-- ============================================================

-- 1. Ampliar el enum tipo en impresion_trabajos para soportar RECLAMOS
ALTER TABLE `impresion_trabajos`
  MODIFY COLUMN `tipo` enum('COMANDA','RECLAMOS') NOT NULL DEFAULT 'COMANDA';

-- 2. Agregar campo opcional de teléfono de reclamos en sedes
ALTER TABLE `sedes`
  ADD COLUMN `telefono_reclamos` varchar(20) DEFAULT NULL AFTER `telefono`;
