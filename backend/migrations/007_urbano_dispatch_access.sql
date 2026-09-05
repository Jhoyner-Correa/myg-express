-- Permiso independiente para consultar despachos y guias de Urbano.
-- Permite asignar este modulo sin exponer el Panel central.

INSERT INTO `permisos`
  (`codigo`, `modulo`, `accion`, `nombre`, `descripcion`, `estado`)
VALUES
  ('urbano.despachos.ver', 'URBANO_DESPACHOS', 'VER',
   'Consultar despachos Urbano',
   'Consultar CDP, guias y datos operativos de los despachos de Urbano', 'ACTIVO')
ON DUPLICATE KEY UPDATE
  `modulo` = VALUES(`modulo`),
  `accion` = VALUES(`accion`),
  `nombre` = VALUES(`nombre`),
  `descripcion` = VALUES(`descripcion`),
  `estado` = 'ACTIVO';

-- Es una capacidad administrativa: solo puede asignarse dentro de estos roles.
INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT role.id, permission.id
FROM `roles` role
INNER JOIN `permisos` permission
  ON permission.codigo = 'urbano.despachos.ver'
WHERE role.codigo IN ('SysAdmin', 'AdminEmpresa');
