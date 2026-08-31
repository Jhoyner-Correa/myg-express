-- Elimina únicamente el escenario creado por rrhh_demo_data.sql.
USE sistema_mensajeria;
START TRANSACTION;

CREATE TEMPORARY TABLE tmp_rrhh_demo_employees (id INT UNSIGNED PRIMARY KEY);
INSERT INTO tmp_rrhh_demo_employees
SELECT id FROM personal_empleados WHERE codigo_empleado LIKE 'DEMO-RH-%';

-- Asistencias usa RESTRICT; marcaciones y horas extra se eliminan en cascada.
DELETE attendance FROM personal_asistencias attendance
INNER JOIN tmp_rrhh_demo_employees demo ON demo.id = attendance.empleado_id;

-- El resto de las relaciones del escenario está configurado con CASCADE.
DELETE employee FROM personal_empleados employee
INNER JOIN tmp_rrhh_demo_employees demo ON demo.id = employee.id;

-- Quita los cargos creados por el seed solo cuando ya no están en uso.
DELETE role FROM personal_cargos role
WHERE role.descripcion LIKE '[SEED_RRHH_DEMO]%'
  AND NOT EXISTS (SELECT 1 FROM personal_empleados employee WHERE employee.cargo_id = role.id);

DROP TEMPORARY TABLE tmp_rrhh_demo_employees;
COMMIT;

SELECT COUNT(*) AS colaboradores_demo_restantes
FROM personal_empleados
WHERE codigo_empleado LIKE 'DEMO-RH-%';

