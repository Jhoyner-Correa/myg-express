-- Preflight de políticas de horario. Todos los conteos deben ser cero.

SELECT COUNT(*) AS horarios_invalidos
FROM personal_horarios
WHERE nombre IS NULL OR TRIM(nombre) = ''
   OR hora_entrada IS NULL OR hora_salida IS NULL
   OR hora_entrada = hora_salida
   OR tolerancia_minutos < 0 OR tolerancia_minutos > 180;

SELECT COUNT(*) AS nombres_duplicados
FROM (
  SELECT LOWER(TRIM(nombre))
  FROM personal_horarios
  GROUP BY LOWER(TRIM(nombre))
  HAVING COUNT(*) > 1
) duplicates;

SELECT COUNT(*) AS asignaciones_huerfanas
FROM personal_empleado_horarios assignment
LEFT JOIN personal_empleados employee ON employee.id = assignment.empleado_id
LEFT JOIN personal_horarios schedule ON schedule.id = assignment.horario_id
WHERE employee.id IS NULL OR schedule.id IS NULL;

SELECT COUNT(*) AS asignaciones_invalidas
FROM personal_empleado_horarios
WHERE dia_semana NOT BETWEEN 1 AND 7;
