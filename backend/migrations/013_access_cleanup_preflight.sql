-- Verificación previa al retiro definitivo de columnas heredadas de usuarios.
-- Todos los conteos deben devolver cero.

SELECT COUNT(*) AS usuarios_sin_asignacion_principal
FROM (
  SELECT usuario.id
  FROM usuarios usuario
  LEFT JOIN usuario_asignaciones asignacion
    ON asignacion.usuario_id = usuario.id
   AND asignacion.estado = 'ACTIVA'
   AND asignacion.es_principal = 1
   AND asignacion.vigente_desde <= NOW()
   AND (asignacion.vigente_hasta IS NULL OR asignacion.vigente_hasta >= NOW())
  GROUP BY usuario.id
  HAVING COUNT(asignacion.id) <> 1
) inconsistencias;

SELECT COUNT(*) AS tipos_inconsistentes
FROM usuarios usuario
INNER JOIN usuario_asignaciones asignacion
  ON asignacion.usuario_id = usuario.id
 AND asignacion.estado = 'ACTIVA'
 AND asignacion.es_principal = 1
INNER JOIN roles rol ON rol.id = asignacion.rol_id
WHERE usuario.tipo_usuario <> rol.tipo_usuario;

SELECT COUNT(*) AS alcances_inconsistentes
FROM usuario_asignaciones
WHERE estado = 'ACTIVA'
  AND (
    (alcance = 'SISTEMA' AND (empresa_id IS NOT NULL OR sede_id IS NOT NULL))
    OR (alcance = 'EMPRESA' AND (empresa_id IS NULL OR sede_id IS NOT NULL))
    OR (alcance = 'SEDE' AND (empresa_id IS NULL OR sede_id IS NULL))
  );

SELECT COUNT(*) AS sedes_fuera_de_empresa
FROM usuario_asignaciones asignacion
INNER JOIN sedes sede ON sede.id = asignacion.sede_id
WHERE asignacion.sede_id IS NOT NULL
  AND asignacion.empresa_id <> sede.empresa_id;
