-- Migración 018: Eliminación definitiva de tablas del módulo de fotos de guías Urbano
-- Remueve permanentemente las tablas auxiliares creadas en la migración 017

DROP TABLE IF EXISTS urbano_fotos_historial;
DROP TABLE IF EXISTS urbano_guias_man_id_det;
