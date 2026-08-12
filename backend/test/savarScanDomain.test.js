const test = require('node:test');
const assert = require('node:assert/strict');

const {
  cleanSavarText,
  MAX_SAVAR_IMPORT_ROWS,
  parseSavarImportRows,
  savarSedeScope
} = require('../dist/modules/logistica/domain/savarScanDomain');

test('limpia y limita texto recibido por SAVAR SCAN', () => {
  assert.equal(cleanSavarText('  ABC-123  ', 100), 'ABC-123');
  assert.equal(cleanSavarText('123456', 4), '1234');
  assert.equal(cleanSavarText(null, 20), '');
});

test('normaliza filas importadas y conserva códigos numéricos como texto', () => {
  const result = parseSavarImportRows([
    { codigo: 12345, consignado: '  María  ', telefono: 987654321, distrito: 'Satipo' }
  ]);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    codigo: '12345',
    consignado: 'María',
    direccion: '',
    telefono: '987654321',
    departamento: '',
    provincia: '',
    distrito: 'Satipo'
  });
});

test('omite filas inválidas y deduplica códigos dentro del mismo archivo', () => {
  const result = parseSavarImportRows([
    { codigo: 'A-1', consignado: 'Primero' },
    { codigo: 'A-1', consignado: 'Actualizado' },
    { codigo: '', consignado: 'Sin código' },
    null
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].consignado, 'Actualizado');
  assert.equal(result.duplicates, 1);
  assert.equal(result.invalid, 2);
});

test('rechaza estructuras que no sean arreglos', () => {
  assert.deepEqual(parseSavarImportRows({ codigo: 'A' }), { rows: [], duplicates: 0, invalid: 0 });
  assert.equal(MAX_SAVAR_IMPORT_ROWS, 10000);
});

test('construye un alcance SQL obligatorio y parametrizado por sede', () => {
  assert.deepEqual(savarSedeScope('p', 2), { where: 'p.sede_id = ?', params: [2] });
  assert.throws(() => savarSedeScope('p; DROP TABLE paquetes', 2), /Alias SQL inválido/);
  assert.throws(() => savarSedeScope('p', 0), /Sede inválida/);
});
