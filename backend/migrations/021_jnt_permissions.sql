-- ============================================================
-- Migración 021: Permisos y visibilidad para el módulo J&T Express
-- ============================================================

INSERT INTO `permisos`
  (`codigo`, `modulo`, `accion`, `nombre`, `descripcion`, `estado`)
VALUES
  ('jnt.ver', 'JNT', 'VER', 'Consultar J&T Express',
   'Consultar paquetes y consignados importados desde manifiestos de J&T Express', 'ACTIVO'),
  ('jnt.gestionar', 'JNT', 'GESTIONAR', 'Gestionar J&T Express',
   'Importar PDFs de J&T Express, descargar reportes y crear rutas de WhatsApp', 'ACTIVO')
ON DUPLICATE KEY UPDATE
  `modulo` = VALUES(`modulo`),
  `accion` = VALUES(`accion`),
  `nombre` = VALUES(`nombre`),
  `descripcion` = VALUES(`descripcion`),
  `estado` = 'ACTIVO';

INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT role.id, permission.id
FROM `roles` role
INNER JOIN `permisos` permission
  ON permission.codigo IN ('jnt.ver', 'jnt.gestionar')
WHERE role.codigo IN (
  'SysAdmin', 'AdminEmpresa', 'GerenteEmpresa', 'SupervisorSede', 'EncargadoOficina'
);

-- Asegurar que las cuentas con preferencias de sidebar personalizadas incluyan el nuevo módulo
UPDATE `usuario_preferencias_ui`
SET `modulos_sidebar` = JSON_ARRAY_APPEND(`modulos_sidebar`, '$', 'jnt.ver')
WHERE `modulos_sidebar` IS NOT NULL
  AND JSON_CONTAINS(`modulos_sidebar`, '"jnt.ver"') = 0;
