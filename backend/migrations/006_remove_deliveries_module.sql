-- Retiro definitivo del módulo Gestión de entregas.
-- Conserva rutas, paquetes, destinatarios, avisos de WhatsApp y su historial.

DELETE user_permission
FROM usuario_permisos user_permission
INNER JOIN permisos permission ON permission.id = user_permission.permiso_id
WHERE permission.codigo IN ('entregas.ver', 'entregas.gestionar');

DELETE role_permission
FROM rol_permisos role_permission
INNER JOIN permisos permission ON permission.id = role_permission.permiso_id
WHERE permission.codigo IN ('entregas.ver', 'entregas.gestionar');

DELETE FROM permisos
WHERE codigo IN ('entregas.ver', 'entregas.gestionar');

ALTER TABLE avisos_diarios
  DROP FOREIGN KEY fk_avisos_entregado_usuario,
  DROP INDEX idx_avisos_entrega_sede_estado,
  DROP INDEX idx_avisos_busqueda_entrega,
  DROP INDEX idx_avisos_entregado_por,
  DROP COLUMN estado_entrega,
  DROP COLUMN fecha_entrega,
  DROP COLUMN entregado_por,
  DROP COLUMN observacion_entrega;

ALTER TABLE lotes_carga
  DROP INDEX idx_lotes_entregas,
  DROP COLUMN entregas_habilitado,
  DROP COLUMN fecha_habilitado_entregas;
