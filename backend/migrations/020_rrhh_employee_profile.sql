-- MariaDB 10.4+. Datos complementarios del perfil laboral.
-- Las columnas admiten NULL para conservar los registros historicos existentes.

ALTER TABLE personal_empleados
  ADD COLUMN IF NOT EXISTS ruc VARCHAR(11) NULL AFTER dni,
  ADD COLUMN IF NOT EXISTS direccion VARCHAR(255) NULL AFTER email;

CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_empleados_ruc
  ON personal_empleados (ruc);
