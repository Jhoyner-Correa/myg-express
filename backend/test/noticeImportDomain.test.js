const test = require('node:test');
const assert = require('node:assert/strict');

const { MAX_NOTICE_IMPORT_ROWS, parseNoticeImportRows } = require('../dist/modules/logistica/domain/noticeImportDomain');

test('normaliza una fila importada desde Urbano', () => {
  const result = parseNoticeImportRows([{ nombre: '<b>MarÃ­a</b>', telefono: '+51 987-654-321', codigo_paquete: ' WYB-1 ', peso_kg: '1,250 kg', piezas: '2' }]);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    nombre: 'MarÃ­a', telefono: '51987654321', codigo_paquete: 'WYB-1', peso_kg: 1.25,
    tipo_paquete_urbano: null, piezas: 2, contenido_paquete: null, id_plantilla: null, mensaje_personalizado: null
  });
});

test('omite telÃ©fonos invÃ¡lidos y guÃ­as duplicadas dentro de la solicitud', () => {
  const result = parseNoticeImportRows([
    { telefono: '987654321', codigo_paquete: 'WYB-1' },
    { telefono: '999999999', codigo_paquete: 'wyb-1' },
    { telefono: '123', codigo_paquete: 'WYB-2' },
  ]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.invalid, 1);
});

test('rechaza estructuras invÃ¡lidas y limita cargas excesivas', () => {
  assert.deepEqual(parseNoticeImportRows({}), { rows: [], invalid: 0, duplicates: 0 });
  const items = Array.from({ length: MAX_NOTICE_IMPORT_ROWS + 2 }, (_, index) => ({ telefono: '987654321', codigo_paquete: `PK-${index}` }));
  const result = parseNoticeImportRows(items);
  assert.equal(result.rows.length, MAX_NOTICE_IMPORT_ROWS);
  assert.equal(result.invalid, 2);
});
