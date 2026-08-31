-- MariaDB 10.4+. Solo lectura: no modifica datos.
-- Todos los resultados deben ser cero antes de aplicar 006_rrhh_mobile_foundation.sql.

SELECT COUNT(*) AS marcaciones_duplicadas
FROM (
  SELECT asistencia_id, tipo_marcacion
  FROM personal_marcaciones
  GROUP BY asistencia_id, tipo_marcacion
  HAVING COUNT(*) > 1
) duplicates;

SELECT COUNT(*) AS empleados_con_multiples_dispositivos_autorizados
FROM (
  SELECT empleado_id
  FROM personal_dispositivos
  WHERE estado = 'AUTORIZADO'
  GROUP BY empleado_id
  HAVING COUNT(*) > 1
) duplicates;

SELECT COUNT(*) AS dispositivos_sin_empleado
FROM personal_dispositivos device
LEFT JOIN personal_empleados employee ON employee.id = device.empleado_id
WHERE employee.id IS NULL;

SELECT COUNT(*) AS marcaciones_sin_asistencia
FROM personal_marcaciones clock_event
LEFT JOIN personal_asistencias attendance ON attendance.id = clock_event.asistencia_id
WHERE attendance.id IS NULL;
