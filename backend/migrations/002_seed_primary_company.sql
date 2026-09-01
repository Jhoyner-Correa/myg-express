-- Registra el tenant corporativo requerido por sedes, accesos y RR. HH.
-- Es idempotente para permitir instalaciones limpias y bases ya inicializadas.

INSERT INTO empresas (
  codigo,
  razon_social,
  ruc,
  nombre_comercial,
  zona_horaria,
  estado
)
SELECT
  'MYG_EXPRESS',
  NULL,
  NULL,
  'MyG Express',
  'America/Lima',
  'ACTIVA'
WHERE NOT EXISTS (
  SELECT 1
  FROM empresas
  WHERE codigo = 'MYG_EXPRESS'
);
