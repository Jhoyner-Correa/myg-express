-- Datos integrales y reversibles para probar el módulo de RR. HH.
-- MariaDB 10.4+. Ejecutar únicamente en desarrollo o demostración.
-- Los registros propios del usuario no se modifican.

USE sistema_mensajeria;
START TRANSACTION;

SET @demo_date := CURDATE();
SET @admin_id := (
  SELECT id FROM usuarios
  WHERE estado = 'activo'
  ORDER BY (usuario = 'renzo_admin') DESC, id
  LIMIT 1
);
SET @site_chanchamayo := (SELECT id FROM sedes WHERE UPPER(nombre) = 'CHANCHAMAYO' LIMIT 1);
SET @site_oxapampa := COALESCE((SELECT id FROM sedes WHERE UPPER(nombre) = 'OXAPAMPA' LIMIT 1), @site_chanchamayo);
SET @site_satipo := COALESCE((SELECT id FROM sedes WHERE UPPER(nombre) = 'SATIPO' LIMIT 1), @site_chanchamayo);
SET @schedule_id := (SELECT id FROM personal_horarios WHERE estado = 'ACTIVO' ORDER BY (nombre = 'horario de oficina') DESC, id LIMIT 1);
SET @schedule_version_id := (
  SELECT id FROM personal_horario_versiones
  WHERE horario_id = @schedule_id
    AND vigente_desde <= @demo_date
    AND (vigente_hasta IS NULL OR vigente_hasta >= @demo_date)
  ORDER BY vigente_desde DESC, numero_version DESC
  LIMIT 1
);

-- Catálogo funcional de cargos.
INSERT INTO personal_cargos (nombre, descripcion, tipo_rastreo_defecto)
SELECT 'Repartidor', '[SEED_RRHH_DEMO] Personal de distribución y reparto.', 'CONTINUO'
WHERE NOT EXISTS (SELECT 1 FROM personal_cargos WHERE nombre = 'Repartidor');
INSERT INTO personal_cargos (nombre, descripcion, tipo_rastreo_defecto)
SELECT 'Atención al cliente', '[SEED_RRHH_DEMO] Atención operativa en oficina.', 'SOLO_MARCACION'
WHERE NOT EXISTS (SELECT 1 FROM personal_cargos WHERE nombre = 'Atención al cliente');
INSERT INTO personal_cargos (nombre, descripcion, tipo_rastreo_defecto)
SELECT 'Auxiliar de almacén', '[SEED_RRHH_DEMO] Control y organización de almacén.', 'SOLO_MARCACION'
WHERE NOT EXISTS (SELECT 1 FROM personal_cargos WHERE nombre = 'Auxiliar de almacén');
INSERT INTO personal_cargos (nombre, descripcion, tipo_rastreo_defecto)
SELECT 'Asistente administrativo', '[SEED_RRHH_DEMO] Soporte administrativo corporativo.', 'SOLO_MARCACION'
WHERE NOT EXISTS (SELECT 1 FROM personal_cargos WHERE nombre = 'Asistente administrativo');

SET @role_delivery := (SELECT id FROM personal_cargos WHERE nombre = 'Repartidor' LIMIT 1);
SET @role_service := (SELECT id FROM personal_cargos WHERE nombre = 'Atención al cliente' LIMIT 1);
SET @role_warehouse := (SELECT id FROM personal_cargos WHERE nombre = 'Auxiliar de almacén' LIMIT 1);
SET @role_admin := (SELECT id FROM personal_cargos WHERE nombre = 'Asistente administrativo' LIMIT 1);

-- Seis colaboradores ficticios claramente identificables.
INSERT INTO personal_empleados
  (codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, sexo, telefono, email,
   fecha_ingreso, tipo_rastreo, estado, observaciones)
SELECT 'DEMO-RH-001', @site_chanchamayo, @role_delivery, '91000001', 'Carlos', 'Ramírez Soto', 'M',
       '900100001', 'carlos.ramirez.demo@myg.local', DATE_SUB(@demo_date, INTERVAL 240 DAY),
       'CONTINUO', 'ACTIVO', '[SEED_RRHH_DEMO] Colaborador ficticio para pruebas.'
WHERE NOT EXISTS (SELECT 1 FROM personal_empleados WHERE codigo_empleado = 'DEMO-RH-001' OR dni = '91000001');

INSERT INTO personal_empleados
  (codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, sexo, telefono, email,
   fecha_ingreso, tipo_rastreo, estado, observaciones)
SELECT 'DEMO-RH-002', @site_chanchamayo, @role_service, '91000002', 'María', 'López Quispe', 'F',
       '900100002', 'maria.lopez.demo@myg.local', DATE_SUB(@demo_date, INTERVAL 190 DAY),
       'SOLO_MARCACION', 'ACTIVO', '[SEED_RRHH_DEMO] Colaborador ficticio para pruebas.'
WHERE NOT EXISTS (SELECT 1 FROM personal_empleados WHERE codigo_empleado = 'DEMO-RH-002' OR dni = '91000002');

INSERT INTO personal_empleados
  (codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, sexo, telefono, email,
   fecha_ingreso, tipo_rastreo, estado, observaciones)
SELECT 'DEMO-RH-003', @site_oxapampa, @role_delivery, '91000003', 'Luis', 'Fernández Vega', 'M',
       '900100003', 'luis.fernandez.demo@myg.local', DATE_SUB(@demo_date, INTERVAL 320 DAY),
       'CONTINUO', 'ACTIVO', '[SEED_RRHH_DEMO] Colaborador ficticio para pruebas.'
WHERE NOT EXISTS (SELECT 1 FROM personal_empleados WHERE codigo_empleado = 'DEMO-RH-003' OR dni = '91000003');

INSERT INTO personal_empleados
  (codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, sexo, telefono, email,
   fecha_ingreso, tipo_rastreo, estado, observaciones)
SELECT 'DEMO-RH-004', @site_oxapampa, @role_admin, '91000004', 'Ana', 'Torres Rojas', 'F',
       '900100004', 'ana.torres.demo@myg.local', DATE_SUB(@demo_date, INTERVAL 120 DAY),
       'SOLO_MARCACION', 'ACTIVO', '[SEED_RRHH_DEMO] Colaborador ficticio para pruebas.'
WHERE NOT EXISTS (SELECT 1 FROM personal_empleados WHERE codigo_empleado = 'DEMO-RH-004' OR dni = '91000004');

INSERT INTO personal_empleados
  (codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, sexo, telefono, email,
   fecha_ingreso, tipo_rastreo, estado, observaciones)
SELECT 'DEMO-RH-005', @site_satipo, @role_warehouse, '91000005', 'Sofía', 'Martínez Flores', 'F',
       '900100005', 'sofia.martinez.demo@myg.local', DATE_SUB(@demo_date, INTERVAL 280 DAY),
       'SOLO_MARCACION', 'ACTIVO', '[SEED_RRHH_DEMO] Colaborador ficticio para pruebas.'
WHERE NOT EXISTS (SELECT 1 FROM personal_empleados WHERE codigo_empleado = 'DEMO-RH-005' OR dni = '91000005');

INSERT INTO personal_empleados
  (codigo_empleado, sede_id, cargo_id, dni, nombres, apellidos, sexo, telefono, email,
   fecha_ingreso, tipo_rastreo, estado, observaciones)
SELECT 'DEMO-RH-006', @site_satipo, @role_delivery, '91000006', 'Diego', 'Herrera Campos', 'M',
       '900100006', 'diego.herrera.demo@myg.local', DATE_SUB(@demo_date, INTERVAL 410 DAY),
       'CONTINUO', 'ACTIVO', '[SEED_RRHH_DEMO] Colaborador ficticio para pruebas.'
WHERE NOT EXISTS (SELECT 1 FROM personal_empleados WHERE codigo_empleado = 'DEMO-RH-006' OR dni = '91000006');

-- Horario individual de lunes a sábado, vigente desde hoy.
INSERT INTO personal_horario_asignaciones
  (alcance, sede_id, empleado_id, horario_id, dia_semana, vigente_desde, vigente_hasta, creado_por)
SELECT 'EMPLEADO', NULL, employee.id, @schedule_id, weekday.day_number, @demo_date, NULL, @admin_id
FROM personal_empleados employee
CROSS JOIN (
  SELECT 1 day_number UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) weekday
WHERE employee.codigo_empleado LIKE 'DEMO-RH-%'
  AND @schedule_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM personal_horario_asignaciones assignment
    WHERE assignment.alcance = 'EMPLEADO'
      AND assignment.empleado_id = employee.id
      AND assignment.dia_semana = weekday.day_number
      AND assignment.vigente_desde = @demo_date
  );

CREATE TEMPORARY TABLE tmp_rrhh_demo_days (day_offset TINYINT UNSIGNED PRIMARY KEY);
INSERT INTO tmp_rrhh_demo_days VALUES (0), (1), (2), (3), (4), (5), (6);

-- Historial semanal: hoy quedan tres colaboradores con marcación, uno sin registrar,
-- uno con permiso y uno de vacaciones. En días anteriores existe variación realista.
INSERT INTO personal_asistencias
  (empleado_id, fecha, horario_version_id, estado_asistencia, tipo_asistencia, minutos_tardanza)
SELECT employee.id,
       DATE_SUB(@demo_date, INTERVAL days.day_offset DAY),
       @schedule_version_id,
       CASE
         WHEN employee.codigo_empleado = 'DEMO-RH-002' AND days.day_offset IN (0, 2, 4) THEN 'TARDANZA'
         WHEN employee.codigo_empleado = 'DEMO-RH-004' AND days.day_offset IN (1, 3) THEN 'TARDANZA'
         WHEN employee.codigo_empleado = 'DEMO-RH-006' AND days.day_offset = 5 THEN 'TARDANZA'
         ELSE 'PRESENTE'
       END,
       'NORMAL',
       CASE
         WHEN employee.codigo_empleado = 'DEMO-RH-002' AND days.day_offset IN (0, 2, 4) THEN 18
         WHEN employee.codigo_empleado = 'DEMO-RH-004' AND days.day_offset IN (1, 3) THEN 12
         WHEN employee.codigo_empleado = 'DEMO-RH-006' AND days.day_offset = 5 THEN 9
         ELSE 0
       END
FROM personal_empleados employee
CROSS JOIN tmp_rrhh_demo_days days
WHERE employee.codigo_empleado LIKE 'DEMO-RH-%'
  AND WEEKDAY(DATE_SUB(@demo_date, INTERVAL days.day_offset DAY)) + 1 <= 6
  AND (days.day_offset > 0 OR employee.codigo_empleado IN ('DEMO-RH-001','DEMO-RH-002','DEMO-RH-003'))
ON DUPLICATE KEY UPDATE
  horario_version_id = VALUES(horario_version_id),
  estado_asistencia = VALUES(estado_asistencia),
  tipo_asistencia = VALUES(tipo_asistencia),
  minutos_tardanza = VALUES(minutos_tardanza);

-- Entrada para cada asistencia del escenario.
INSERT INTO personal_marcaciones
  (request_id, asistencia_id, dispositivo_id, tipo_marcacion, origen_marcacion,
   hora_marcacion, latitud, longitud, precision_gps, red_wifi, dentro_de_radio,
   distancia_sede_metros, verificacion_identidad)
SELECT CONCAT('DRH-', DATE_FORMAT(attendance.fecha, '%Y%m%d'), '-', RIGHT(employee.codigo_empleado, 3), '-E'),
       attendance.id, NULL, 'ENTRADA', 'ADMINISTRATIVO',
       CASE WHEN attendance.estado_asistencia = 'TARDANZA'
         THEN TIMESTAMP(attendance.fecha, ADDTIME('09:00:00', SEC_TO_TIME(attendance.minutos_tardanza * 60)))
         ELSE TIMESTAMP(attendance.fecha, '08:55:00') END,
       CASE employee.sede_id WHEN @site_chanchamayo THEN -11.25560400 WHEN @site_oxapampa THEN -10.57750000 ELSE -11.25220000 END,
       CASE employee.sede_id WHEN @site_chanchamayo THEN -74.64129800 WHEN @site_oxapampa THEN -75.40170000 ELSE -74.63860000 END,
       8.50, 'MYG-DEMO', 1, 6.00, 'ADMINISTRATIVA'
FROM personal_asistencias attendance
INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
WHERE employee.codigo_empleado LIKE 'DEMO-RH-%'
  AND attendance.fecha BETWEEN DATE_SUB(@demo_date, INTERVAL 6 DAY) AND @demo_date
ON DUPLICATE KEY UPDATE
  hora_marcacion = VALUES(hora_marcacion), latitud = VALUES(latitud), longitud = VALUES(longitud),
  precision_gps = VALUES(precision_gps), dentro_de_radio = VALUES(dentro_de_radio),
  distancia_sede_metros = VALUES(distancia_sede_metros);

-- Salida. DEMO-RH-002 queda hoy sin salida para generar una alerta operativa.
INSERT INTO personal_marcaciones
  (request_id, asistencia_id, dispositivo_id, tipo_marcacion, origen_marcacion,
   hora_marcacion, latitud, longitud, precision_gps, red_wifi, dentro_de_radio,
   distancia_sede_metros, verificacion_identidad)
SELECT CONCAT('DRH-', DATE_FORMAT(attendance.fecha, '%Y%m%d'), '-', RIGHT(employee.codigo_empleado, 3), '-S'),
       attendance.id, NULL, 'SALIDA', 'ADMINISTRATIVO',
       CASE
         WHEN employee.codigo_empleado = 'DEMO-RH-003' AND attendance.fecha = @demo_date
           THEN TIMESTAMP(attendance.fecha, '21:35:00')
         WHEN employee.codigo_empleado = 'DEMO-RH-001' AND attendance.fecha = @demo_date
           THEN TIMESTAMP(attendance.fecha, '20:02:00')
         ELSE TIMESTAMP(attendance.fecha, '20:05:00')
       END,
       CASE employee.sede_id WHEN @site_chanchamayo THEN -11.25560400 WHEN @site_oxapampa THEN -10.57750000 ELSE -11.25220000 END,
       CASE employee.sede_id WHEN @site_chanchamayo THEN -74.64129800 WHEN @site_oxapampa THEN -75.40170000 ELSE -74.63860000 END,
       9.20, 'MYG-DEMO', 1, 7.00, 'ADMINISTRATIVA'
FROM personal_asistencias attendance
INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
WHERE employee.codigo_empleado LIKE 'DEMO-RH-%'
  AND attendance.fecha BETWEEN DATE_SUB(@demo_date, INTERVAL 6 DAY) AND @demo_date
  AND NOT (employee.codigo_empleado = 'DEMO-RH-002' AND attendance.fecha = @demo_date)
ON DUPLICATE KEY UPDATE hora_marcacion = VALUES(hora_marcacion);

-- Flujo de almuerzo de los tres colaboradores con asistencia hoy.
INSERT INTO personal_marcaciones
  (request_id, asistencia_id, tipo_marcacion, origen_marcacion, hora_marcacion,
   latitud, longitud, precision_gps, red_wifi, dentro_de_radio, distancia_sede_metros,
   verificacion_identidad)
SELECT CONCAT('DRH-', DATE_FORMAT(@demo_date, '%Y%m%d'), '-', RIGHT(employee.codigo_empleado, 3), '-LA'),
       attendance.id, 'SALIDA_ALMUERZO', 'ADMINISTRATIVO', TIMESTAMP(@demo_date, '13:05:00'),
       -11.25560400, -74.64129800, 8.00, 'MYG-DEMO', 1, 5.00, 'ADMINISTRATIVA'
FROM personal_asistencias attendance
INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
WHERE attendance.fecha = @demo_date
  AND employee.codigo_empleado IN ('DEMO-RH-001','DEMO-RH-002','DEMO-RH-003')
ON DUPLICATE KEY UPDATE hora_marcacion = VALUES(hora_marcacion);

INSERT INTO personal_marcaciones
  (request_id, asistencia_id, tipo_marcacion, origen_marcacion, hora_marcacion,
   latitud, longitud, precision_gps, red_wifi, dentro_de_radio, distancia_sede_metros,
   verificacion_identidad)
SELECT CONCAT('DRH-', DATE_FORMAT(@demo_date, '%Y%m%d'), '-', RIGHT(employee.codigo_empleado, 3), '-LR'),
       attendance.id, 'REGRESO', 'ADMINISTRATIVO', TIMESTAMP(@demo_date, '15:58:00'),
       -11.25560400, -74.64129800, 8.00, 'MYG-DEMO', 1, 5.00, 'ADMINISTRATIVA'
FROM personal_asistencias attendance
INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
WHERE attendance.fecha = @demo_date
  AND employee.codigo_empleado IN ('DEMO-RH-001','DEMO-RH-002','DEMO-RH-003')
ON DUPLICATE KEY UPDATE hora_marcacion = VALUES(hora_marcacion);

-- Hora extra calculada y aprobada para Luis Fernández.
INSERT INTO personal_horas_extras (asistencia_id, horas_calculadas, horas_aprobadas, estado)
SELECT attendance.id, 1.58, 1.50, 'APROBADA'
FROM personal_asistencias attendance
INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
WHERE employee.codigo_empleado = 'DEMO-RH-003' AND attendance.fecha = @demo_date
  AND NOT EXISTS (SELECT 1 FROM personal_horas_extras overtime WHERE overtime.asistencia_id = attendance.id);

UPDATE personal_horas_extras overtime
INNER JOIN personal_asistencias attendance ON attendance.id = overtime.asistencia_id
INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
SET overtime.horas_calculadas = 1.58, overtime.horas_aprobadas = 1.50, overtime.estado = 'APROBADA'
WHERE employee.codigo_empleado = 'DEMO-RH-003' AND attendance.fecha = @demo_date;

-- Permiso aprobado para hoy y solicitud pendiente futura.
INSERT INTO personal_solicitudes_permisos
  (empleado_id, tipo_permiso, fecha_inicio, fecha_fin, motivo, estado,
   aprobado_por, comentario_resolucion, resuelto_en)
SELECT employee.id, 'MEDICO', TIMESTAMP(@demo_date, '09:00:00'), TIMESTAMP(@demo_date, '18:00:00'),
       '[SEED_RRHH_DEMO] Cita médica autorizada.', 'APROBADO', @admin_id,
       'Permiso de demostración aprobado.', NOW()
FROM personal_empleados employee
WHERE employee.codigo_empleado = 'DEMO-RH-005'
  AND NOT EXISTS (SELECT 1 FROM personal_solicitudes_permisos request
                  WHERE request.empleado_id = employee.id AND request.motivo LIKE '[SEED_RRHH_DEMO]%');

INSERT INTO personal_solicitudes_permisos
  (empleado_id, tipo_permiso, fecha_inicio, fecha_fin, motivo, estado)
SELECT employee.id, 'PERSONAL',
       TIMESTAMP(DATE_ADD(@demo_date, INTERVAL 3 DAY), '15:00:00'),
       TIMESTAMP(DATE_ADD(@demo_date, INTERVAL 3 DAY), '18:00:00'),
       '[SEED_RRHH_DEMO] Trámite personal pendiente de revisión.', 'PENDIENTE'
FROM personal_empleados employee
WHERE employee.codigo_empleado = 'DEMO-RH-004'
  AND NOT EXISTS (SELECT 1 FROM personal_solicitudes_permisos request
                  WHERE request.empleado_id = employee.id AND request.motivo LIKE '[SEED_RRHH_DEMO]%');

-- Vacaciones en curso y otra solicitud pendiente.
INSERT INTO personal_vacaciones
  (empleado_id, periodo_anio, fecha_inicio, fecha_fin, dias_tomados, motivo, estado,
   revisado_por, comentario_revision, revisado_en)
SELECT employee.id, YEAR(@demo_date), @demo_date, DATE_ADD(@demo_date, INTERVAL 2 DAY), 3,
       '[SEED_RRHH_DEMO] Vacaciones autorizadas en curso.', 'EN_CURSO', @admin_id,
       'Vacaciones de demostración aprobadas.', NOW()
FROM personal_empleados employee
WHERE employee.codigo_empleado = 'DEMO-RH-006'
  AND NOT EXISTS (SELECT 1 FROM personal_vacaciones vacation
                  WHERE vacation.empleado_id = employee.id AND vacation.motivo LIKE '[SEED_RRHH_DEMO]%');

INSERT INTO personal_vacaciones
  (empleado_id, periodo_anio, fecha_inicio, fecha_fin, dias_tomados, motivo, estado)
SELECT employee.id, YEAR(@demo_date), DATE_ADD(@demo_date, INTERVAL 10 DAY),
       DATE_ADD(@demo_date, INTERVAL 14 DAY), 5,
       '[SEED_RRHH_DEMO] Solicitud de vacaciones pendiente.', 'SOLICITADA'
FROM personal_empleados employee
WHERE employee.codigo_empleado = 'DEMO-RH-003'
  AND NOT EXISTS (SELECT 1 FROM personal_vacaciones vacation
                  WHERE vacation.empleado_id = employee.id AND vacation.motivo LIKE '[SEED_RRHH_DEMO]%');

-- Posiciones activas para el mapa corporativo.
INSERT INTO personal_gps_tiempo_real
  (empleado_id, latitud, longitud, velocidad_kmh, precision_gps, altitud, rumbo,
   estado_movimiento, porcentaje_bateria, ultima_actualizacion)
SELECT employee.id,
       CASE employee.codigo_empleado WHEN 'DEMO-RH-001' THEN -11.25560400 WHEN 'DEMO-RH-003' THEN -10.57750000 ELSE -11.25220000 END,
       CASE employee.codigo_empleado WHEN 'DEMO-RH-001' THEN -74.64129800 WHEN 'DEMO-RH-003' THEN -75.40170000 ELSE -74.63860000 END,
       CASE employee.codigo_empleado WHEN 'DEMO-RH-001' THEN 24.50 WHEN 'DEMO-RH-003' THEN 0.00 ELSE 12.80 END,
       7.50, 650.00, 92.00,
       CASE employee.codigo_empleado WHEN 'DEMO-RH-003' THEN 'DETENIDO' ELSE 'VEHICULO' END,
       CASE employee.codigo_empleado WHEN 'DEMO-RH-001' THEN 78 WHEN 'DEMO-RH-003' THEN 54 ELSE 31 END,
       NOW()
FROM personal_empleados employee
WHERE employee.codigo_empleado IN ('DEMO-RH-001','DEMO-RH-003','DEMO-RH-006')
ON DUPLICATE KEY UPDATE
  latitud = VALUES(latitud), longitud = VALUES(longitud), velocidad_kmh = VALUES(velocidad_kmh),
  precision_gps = VALUES(precision_gps), estado_movimiento = VALUES(estado_movimiento),
  porcentaje_bateria = VALUES(porcentaje_bateria), ultima_actualizacion = VALUES(ultima_actualizacion);

-- Recorrido corto para consultar el historial GPS.
DELETE gps_history FROM personal_gps_historial gps_history
INNER JOIN personal_empleados employee ON employee.id = gps_history.empleado_id
WHERE employee.codigo_empleado LIKE 'DEMO-RH-%' AND DATE(gps_history.registrado_en) = @demo_date;

CREATE TEMPORARY TABLE tmp_rrhh_demo_points (
  minute_offset SMALLINT UNSIGNED PRIMARY KEY,
  latitude_delta DECIMAL(10,8) NOT NULL,
  longitude_delta DECIMAL(11,8) NOT NULL
);
INSERT INTO tmp_rrhh_demo_points VALUES
  (180, -0.00300000, -0.00200000),
  (120, -0.00200000, -0.00100000),
  (60,  -0.00100000, -0.00050000),
  (0,    0.00000000,  0.00000000);

INSERT INTO personal_gps_historial
  (empleado_id, latitud, longitud, velocidad_kmh, precision_gps, altitud, rumbo,
   estado_movimiento, porcentaje_bateria, registrado_en)
SELECT employee.id,
       (CASE employee.codigo_empleado WHEN 'DEMO-RH-001' THEN -11.25560400 WHEN 'DEMO-RH-003' THEN -10.57750000 ELSE -11.25220000 END) + point.latitude_delta,
       (CASE employee.codigo_empleado WHEN 'DEMO-RH-001' THEN -74.64129800 WHEN 'DEMO-RH-003' THEN -75.40170000 ELSE -74.63860000 END) + point.longitude_delta,
       18.00, 8.00, 650.00, 90.00, 'VEHICULO', 65,
       DATE_SUB(NOW(), INTERVAL point.minute_offset MINUTE)
FROM personal_empleados employee
CROSS JOIN tmp_rrhh_demo_points point
WHERE employee.codigo_empleado IN ('DEMO-RH-001','DEMO-RH-003','DEMO-RH-006');

-- Alertas operativas para validar el centro de atención.
INSERT INTO personal_notificaciones (empleado_id, tipo_alerta, titulo, mensaje, leido)
SELECT employee.id, 'ASISTENCIA', '[DEMO] Tardanza registrada',
       'Se registraron 18 minutos de tardanza. Requiere seguimiento administrativo.', 0
FROM personal_empleados employee
WHERE employee.codigo_empleado = 'DEMO-RH-002'
  AND NOT EXISTS (SELECT 1 FROM personal_notificaciones notification
                  WHERE notification.empleado_id = employee.id AND notification.titulo = '[DEMO] Tardanza registrada');

INSERT INTO personal_notificaciones (empleado_id, tipo_alerta, titulo, mensaje, leido)
SELECT employee.id, 'ASISTENCIA', '[DEMO] Sin marcación de entrada',
       'El colaborador no registra entrada para la jornada actual.', 0
FROM personal_empleados employee
WHERE employee.codigo_empleado = 'DEMO-RH-004'
  AND NOT EXISTS (SELECT 1 FROM personal_notificaciones notification
                  WHERE notification.empleado_id = employee.id AND notification.titulo = '[DEMO] Sin marcación de entrada');

INSERT INTO personal_notificaciones (empleado_id, tipo_alerta, titulo, mensaje, leido)
SELECT employee.id, 'BATERIA_BAJA', '[DEMO] Batería baja en dispositivo',
       'El dispositivo de rastreo reporta 31% de batería.', 0
FROM personal_empleados employee
WHERE employee.codigo_empleado = 'DEMO-RH-006'
  AND NOT EXISTS (SELECT 1 FROM personal_notificaciones notification
                  WHERE notification.empleado_id = employee.id AND notification.titulo = '[DEMO] Batería baja en dispositivo');

DROP TEMPORARY TABLE tmp_rrhh_demo_points;
DROP TEMPORARY TABLE tmp_rrhh_demo_days;
COMMIT;

-- Resumen de comprobación.
SELECT employee.codigo_empleado, employee.nombres, employee.apellidos,
       site.nombre AS sede, role.nombre AS cargo, employee.estado
FROM personal_empleados employee
INNER JOIN sedes site ON site.id = employee.sede_id
INNER JOIN personal_cargos role ON role.id = employee.cargo_id
WHERE employee.codigo_empleado LIKE 'DEMO-RH-%'
ORDER BY employee.codigo_empleado;

SELECT attendance.fecha, employee.codigo_empleado, attendance.estado_asistencia,
       attendance.minutos_tardanza, COUNT(marking.id) AS marcaciones
FROM personal_asistencias attendance
INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
LEFT JOIN personal_marcaciones marking ON marking.asistencia_id = attendance.id
WHERE employee.codigo_empleado LIKE 'DEMO-RH-%'
GROUP BY attendance.id, attendance.fecha, employee.codigo_empleado,
         attendance.estado_asistencia, attendance.minutos_tardanza
ORDER BY attendance.fecha DESC, employee.codigo_empleado;
