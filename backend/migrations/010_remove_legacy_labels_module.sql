-- Retiro definitivo del modulo provisional "Generar etiquetas".
-- El modulo profesional de Impresion y sus permisos permanecen activos.

DELETE user_permission
FROM usuario_permisos user_permission
INNER JOIN permisos permission ON permission.id = user_permission.permiso_id
WHERE permission.codigo = 'etiquetas.ver';

DELETE role_permission
FROM rol_permisos role_permission
INNER JOIN permisos permission ON permission.id = role_permission.permiso_id
WHERE permission.codigo = 'etiquetas.ver';

DELETE FROM permisos
WHERE codigo = 'etiquetas.ver';

UPDATE usuario_preferencias_ui
SET modulos_sidebar = JSON_REMOVE(
  modulos_sidebar,
  JSON_UNQUOTE(JSON_SEARCH(modulos_sidebar, 'one', 'etiquetas.ver'))
)
WHERE JSON_VALID(modulos_sidebar)
  AND JSON_SEARCH(modulos_sidebar, 'one', 'etiquetas.ver') IS NOT NULL;
