-- Preflight del modelo de acceso corporativo. Todos los conteos deben ser cero.

SELECT COUNT(*) AS usuarios_sin_identidad
FROM usuarios
WHERE nombre IS NULL OR TRIM(nombre) = ''
   OR usuario IS NULL OR TRIM(usuario) = ''
   OR password_hash IS NULL OR TRIM(password_hash) = '';

SELECT COUNT(*) AS usuarios_con_sede_huerfana
FROM usuarios usuario
LEFT JOIN sedes sede ON sede.id = usuario.sede_id
WHERE usuario.sede_id IS NOT NULL AND sede.id IS NULL;

SELECT COUNT(*) AS encargados_sin_sede
FROM usuarios
WHERE rol = 'EncargadoOficina' AND sede_id IS NULL;

SELECT COUNT(*) AS roles_no_reconocidos
FROM usuarios
WHERE rol NOT IN ('SysAdmin', 'AdminEmpresa', 'EncargadoOficina');

SELECT COUNT(*) AS permisos_json_invalidos
FROM usuarios
WHERE permisos IS NOT NULL
  AND (JSON_VALID(permisos) = 0 OR JSON_TYPE(permisos) <> 'ARRAY');

SELECT COUNT(*) AS sysadmin_inconsistente
FROM usuarios
WHERE (rol = 'SysAdmin' AND es_superadmin <> 1)
   OR (rol <> 'SysAdmin' AND es_superadmin = 1);
