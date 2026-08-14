const test = require('node:test');
const assert = require('node:assert/strict');
const { assertEmployeeDefinition } = require('../dist/modules/rrhh/domain/employeePolicy');

const employee = {
  codigoEmpleado: 'MYG-001', sedeId: 2, cargoId: 1, dni: '12345678', nombres: 'Carlos', apellidos: 'Ramírez',
  sexo: 'M', telefono: '999888777', email: 'carlos@myg.pe', foto: null, fechaIngreso: new Date('2026-08-13'),
  fechaCese: null, tipoRastreo: 'SOLO_MARCACION', estado: 'ACTIVO', observaciones: null,
};

test('acepta una definición laboral completa', () => assert.doesNotThrow(() => assertEmployeeDefinition(employee)));
test('rechaza documentos y correos manipulados', () => {
  assert.throws(() => assertEmployeeDefinition({ ...employee, dni: '12A' }), /dígitos/);
  assert.throws(() => assertEmployeeDefinition({ ...employee, email: 'correo-invalido' }), /formato válido/);
});
test('rechaza fechas y clasificaciones fuera del dominio', () => {
  assert.throws(() => assertEmployeeDefinition({ ...employee, fechaIngreso: new Date('invalid') }), /fecha de ingreso/);
  assert.throws(() => assertEmployeeDefinition({ ...employee, estado: 'BORRADO' }), /clasificación laboral/);
});
