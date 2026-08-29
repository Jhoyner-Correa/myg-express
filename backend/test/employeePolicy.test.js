const test = require('node:test');
const assert = require('node:assert/strict');
const { assertEmployeeDefinition } = require('../dist/modules/rrhh/domain/employeePolicy');

const employee = {
  codigoEmpleado: 'MYG-001', sedeId: 2, cargoId: 1, dni: '12345678', ruc: '20601030013', nombres: 'Carlos', apellidos: 'Ramírez',
  sexo: 'M', telefono: '999888777', email: 'carlos@myg.pe', direccion: 'Av. Principal 123', foto: null, fechaIngreso: new Date('2026-08-13'),
  fechaCese: null, tipoRastreo: 'SOLO_MARCACION', estado: 'ACTIVO', observaciones: null,
};

test('acepta una definición laboral completa', () => assert.doesNotThrow(() => assertEmployeeDefinition(employee)));
test('acepta un empleado sin correo', () => assert.doesNotThrow(() => assertEmployeeDefinition({ ...employee, email: null })));
test('acepta un empleado sin RUC', () => assert.doesNotThrow(() => assertEmployeeDefinition({ ...employee, ruc: null })));
test('rechaza documentos y correos manipulados', () => {
  assert.throws(() => assertEmployeeDefinition({ ...employee, dni: '12A' }), /dígitos/);
  assert.throws(() => assertEmployeeDefinition({ ...employee, email: 'correo-invalido' }), /formato válido/);
  assert.throws(() => assertEmployeeDefinition({ ...employee, ruc: '20601030014' }), /RUC/);
  assert.throws(() => assertEmployeeDefinition({ ...employee, direccion: '  ' }), /direccion domiciliaria/);
});
test('rechaza fechas y clasificaciones fuera del dominio', () => {
  assert.throws(() => assertEmployeeDefinition({ ...employee, fechaIngreso: new Date('invalid') }), /fecha de ingreso/);
  assert.throws(() => assertEmployeeDefinition({ ...employee, estado: 'BORRADO' }), /clasificación laboral/);
});
