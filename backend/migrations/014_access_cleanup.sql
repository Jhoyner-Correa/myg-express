-- Modelo final de identidad: roles, permisos y alcance viven en tablas normalizadas.
ALTER TABLE usuarios DROP COLUMN IF EXISTS sede_id;
ALTER TABLE usuarios DROP COLUMN IF EXISTS rol;
ALTER TABLE usuarios DROP COLUMN IF EXISTS superadmin_unico;
ALTER TABLE usuarios DROP COLUMN IF EXISTS es_superadmin;
ALTER TABLE usuarios DROP COLUMN IF EXISTS permisos;
