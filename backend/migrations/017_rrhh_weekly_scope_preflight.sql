-- Preflight de asignaciones semanales por alcance. Todos los conteos deben ser cero.

SELECT COUNT(*) AS asignaciones_huerfanas
FROM personal_empleado_horarios assignment
LEFT JOIN personal_empleados employee ON employee.id = assignment.empleado_id
LEFT JOIN personal_horarios schedule ON schedule.id = assignment.horario_id
WHERE employee.id IS NULL OR schedule.id IS NULL;

SELECT COUNT(*) AS asignaciones_con_dia_invalido
FROM personal_empleado_horarios
WHERE dia_semana NOT BETWEEN 1 AND 7;

SELECT COUNT(*) AS asignaciones_con_periodo_invalido
FROM personal_empleado_horarios
WHERE vigente_hasta IS NOT NULL AND vigente_hasta < vigente_desde;
