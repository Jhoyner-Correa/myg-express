-- Preflight del calendario laboral. Todos los conteos deben ser cero.

SELECT COUNT(*) AS sedes_huerfanas
FROM personal_empleados employee
LEFT JOIN sedes site ON site.id = employee.sede_id
WHERE site.id IS NULL;

SELECT COUNT(*) AS horarios_sin_version
FROM personal_horarios schedule
LEFT JOIN personal_horario_versiones version ON version.horario_id = schedule.id
WHERE version.id IS NULL;
