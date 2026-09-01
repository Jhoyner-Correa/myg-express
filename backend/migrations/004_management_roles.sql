-- Roles de gestión empresarial con separación entre operación, asistencia y pagos.
-- Supervisor/a queda limitado a una sede; Gerente opera con alcance corporativo.

INSERT INTO `roles`
  (`codigo`, `nombre`, `tipo_usuario`, `tipo_alcance`, `descripcion`, `estado`)
VALUES
  ('GerenteEmpresa', 'Gerente', 'EMPRESA', 'EMPRESA',
   'Dirección y control operativo corporativo sin administración técnica ni ejecución de pagos', 'ACTIVO'),
  ('SupervisorSede', 'Supervisor/a de sede', 'EMPRESA', 'SEDE',
   'Supervisión operativa, asistencia y solicitudes limitada a la sede asignada', 'ACTIVO')
ON DUPLICATE KEY UPDATE
  `nombre` = VALUES(`nombre`),
  `tipo_usuario` = VALUES(`tipo_usuario`),
  `tipo_alcance` = VALUES(`tipo_alcance`),
  `descripcion` = VALUES(`descripcion`),
  `estado` = 'ACTIVO';

INSERT INTO `permisos`
  (`codigo`, `modulo`, `accion`, `nombre`, `descripcion`, `estado`)
VALUES
  ('rrhh.asistencia.gestionar', 'RRHH_ASISTENCIA', 'GESTIONAR',
   'Gestionar asistencia y solicitudes',
   'Corregir asistencia y resolver permisos, justificaciones, vacaciones y sobretiempo', 'ACTIVO'),
  ('rrhh.pagos.ver', 'RRHH_PAGOS', 'VER',
   'Consultar pagos mensuales',
   'Consultar honorarios, liquidaciones, recibos y depósitos sin modificarlos', 'ACTIVO'),
  ('rrhh.pagos.gestionar', 'RRHH_PAGOS', 'GESTIONAR',
   'Gestionar pagos mensuales',
   'Administrar acuerdos, movimientos, préstamos, liquidaciones y depósitos', 'ACTIVO')
ON DUPLICATE KEY UPDATE
  `modulo` = VALUES(`modulo`),
  `accion` = VALUES(`accion`),
  `nombre` = VALUES(`nombre`),
  `descripcion` = VALUES(`descripcion`),
  `estado` = 'ACTIVO';

-- La cuenta técnica y el administrador general conservan control completo.
INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT role.id, permission.id
FROM `roles` role
INNER JOIN `permisos` permission
  ON permission.codigo IN (
    'rrhh.asistencia.gestionar', 'rrhh.pagos.ver', 'rrhh.pagos.gestionar'
  )
WHERE role.codigo IN ('SysAdmin', 'AdminEmpresa');

-- Gerencia controla la operación y el personal, y consulta pagos sin ejecutarlos.
INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT role.id, permission.id
FROM `roles` role
INNER JOIN `permisos` permission
  ON permission.codigo IN (
    'dashboard.ver',
    'rutas.ver', 'rutas.gestionar',
    'avisos.ver', 'avisos.gestionar',
    'entregas.ver', 'entregas.gestionar',
    'plantillas.ver', 'plantillas.gestionar',
    'whatsapp.ver', 'whatsapp.gestionar',
    'urbano.rutas.ver', 'urbano.rutas.gestionar',
    'savarscan.ver', 'savarscan.gestionar',
    'etiquetas.ver',
    'rrhh.ver', 'rrhh.gestionar', 'rrhh.asistencia.gestionar', 'rrhh.pagos.ver',
    'gps.ver', 'gps.gestionar'
  )
WHERE role.codigo = 'GerenteEmpresa';

-- Supervisión controla la operación diaria únicamente dentro de su sede.
INSERT IGNORE INTO `rol_permisos` (`rol_id`, `permiso_id`)
SELECT role.id, permission.id
FROM `roles` role
INNER JOIN `permisos` permission
  ON permission.codigo IN (
    'dashboard.ver',
    'rutas.ver', 'rutas.gestionar',
    'avisos.ver', 'avisos.gestionar',
    'entregas.ver', 'entregas.gestionar',
    'plantillas.ver', 'plantillas.gestionar',
    'whatsapp.ver', 'whatsapp.gestionar',
    'urbano.rutas.ver', 'urbano.rutas.gestionar',
    'savarscan.ver', 'savarscan.gestionar',
    'etiquetas.ver',
    'rrhh.ver', 'rrhh.asistencia.gestionar',
    'gps.ver'
  )
WHERE role.codigo = 'SupervisorSede';
