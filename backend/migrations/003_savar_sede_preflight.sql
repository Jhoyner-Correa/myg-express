-- Preflight de aislamiento por sede para SAVAR SCAN.
-- Esta consulta no modifica datos. Revise especialmente `asignacion = REQUIERE_DECISION`.

SELECT
  p.lote_importacion AS lote,
  COUNT(*) AS paquetes,
  SUM(p.estado = 'PENDIENTE') AS pendientes,
  SUM(p.estado = 'LLEGÓ') AS recibidos,
  COUNT(DISTINCT p.sede_id_escaneo) AS sedes_que_escanearon,
  GROUP_CONCAT(DISTINCT p.sede_id_escaneo ORDER BY p.sede_id_escaneo) AS sedes_detectadas,
  CASE
    WHEN COUNT(DISTINCT p.sede_id_escaneo) = 1 THEN 'INFERIBLE_POR_ESCANEO'
    WHEN COUNT(DISTINCT p.sede_id_escaneo) > 1 THEN 'REQUIERE_DECISION'
    WHEN (SELECT COUNT(*) FROM sedes WHERE estado = 'activo') = 1 THEN 'INFERIBLE_POR_SEDE_UNICA'
    ELSE 'REQUIERE_DECISION'
  END AS asignacion
FROM paquetes p
GROUP BY p.lote_importacion
ORDER BY MIN(p.created_at);

SELECT id, nombre, estado
FROM sedes
ORDER BY id;

-- Si una misma carga fue recibida por más de una sede, la propiedad del lote es ambigua.
-- El script automático no toma decisiones sobre esos registros.
SELECT
  lote_importacion AS lote,
  COUNT(DISTINCT sede_id_escaneo) AS sedes_que_escanearon,
  GROUP_CONCAT(DISTINCT sede_id_escaneo ORDER BY sede_id_escaneo) AS sedes_detectadas
FROM paquetes
GROUP BY lote_importacion
HAVING COUNT(DISTINCT sede_id_escaneo) > 1;

-- Debe ser cero para que 004 pueda completarse automáticamente.
SELECT COUNT(*) AS lotes_que_requieren_decision
FROM (
  SELECT p.lote_importacion
  FROM paquetes p
  GROUP BY p.lote_importacion
  HAVING COUNT(DISTINCT p.sede_id_escaneo) > 1
     OR (
       COUNT(DISTINCT p.sede_id_escaneo) = 0
       AND (SELECT COUNT(*) FROM sedes WHERE estado = 'activo') <> 1
     )
) ambiguos;
