const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildClaimsLabelsTspl,
  buildPackageLabelsTspl,
  DEFAULT_LABEL_DESIGN,
  formatPackagePhone,
  normalizeClaimsJobInput,
  normalizePrintJobInput,
  PrintingValidationError,
  toPrinterAscii,
  wrapPrinterText,
} = require('../dist/modules/printing/printingDomain');

const validInput = () => ({ site_id: 2, reference: 'Reparto Satipo', dispatch_day: 'jueves', copies: 1, idempotency_key: 'a9bc8679-e15d-4a2d-a94a-d713d36c93d1', labels: [{ sequence: '12', recipient: 'Gloria Senayda Barbaran Cahuana', phone: '992 130 971' }] });

test('normaliza etiquetas de paquetes y telefono', () => {
  assert.deepEqual(normalizePrintJobInput(validInput()), { siteId: 2, reference: 'Reparto Satipo', dispatchDay: 'JUEVES', copies: 1, idempotencyKey: 'a9bc8679-e15d-4a2d-a94a-d713d36c93d1', labels: [{ sequence: '12', recipient: 'Gloria Senayda Barbaran Cahuana', phone: '992130971' }], design: DEFAULT_LABEL_DESIGN });
});
test('valida los limites del editor de diseño', () => {
  assert.throws(() => normalizePrintJobInput({ ...validInput(), design: { phone_size: 80 } }), /telefono/);
  const value = normalizePrintJobInput({ ...validInput(), design: { font_family: 'VERDANA', density: 9, show_sequence_circle: false } });
  assert.equal(value.design.fontFamily, 'VERDANA'); assert.equal(value.design.density, 9); assert.equal(value.design.showSequenceCircle, false);
});
test('rechaza lotes vacios, telefonos invalidos e identificadores inseguros', () => {
  assert.throws(() => normalizePrintJobInput({ ...validInput(), labels: [] }), PrintingValidationError);
  assert.throws(() => normalizePrintJobInput({ ...validInput(), labels: [{ sequence: '1', recipient: 'Ana', phone: '12' }] }), /telefono/);
  assert.throws(() => normalizePrintJobInput({ ...validInput(), idempotency_key: '../otro' }), PrintingValidationError);
});
test('genera una etiqueta rasterizada con tipografia y posiciones controladas', async () => {
  assert.equal(toPrinterAscii('Muñoz "A"\nCLS'), 'Munoz A CLS');
  assert.ok(wrapPrinterText('Gloria Senayda Barbaran Cahuana', 20).length > 1);
  assert.equal(formatPackagePhone('992130971'), '992 130 971');
  const { payload, labelCount } = await buildPackageLabelsTspl([{ sequence: '12"\nCLS', recipient: 'Gloria Muñoz', phone: '992130971' }], 'JUEVES', 2);
  const raw = Buffer.from(payload.slice(7), 'base64');
  assert.equal(labelCount, 1); assert.ok(payload.startsWith('BASE64:')); assert.match(raw.toString('ascii', 0, 100), /BITMAP 0,0,50,304,0,/); assert.match(raw.toString('ascii', raw.length - 30), /PRINT 1,2/); assert.ok(raw.length > 15000);
});

test('normaliza y valida trabajos de impresion de reclamos por sede', () => {
  const claimsInput = {
    job_type: 'RECLAMOS',
    site_id: 5,
    site_name: 'Satipo',
    phone: '937 742 137',
    copies: 25,
    idempotency_key: 'b1234567-89ab-4cde-8f01-234567890abc',
    address: 'Jr. San Martin 854',
  };
  const normalized = normalizePrintJobInput(claimsInput);
  assert.equal(normalized.jobType, 'RECLAMOS');
  assert.equal(normalized.siteId, 5);
  assert.equal(normalized.copies, 25);
  assert.equal(normalized.config.phone, '937742137');
  assert.equal(normalized.config.siteName, 'Satipo');
  assert.equal(normalized.config.brand, 'MyG');
  assert.equal(normalized.config.subtitle, 'EXPRESS');
  assert.equal(normalized.config.title, 'CONSULTAS Y RECLAMOS');
  assert.equal(normalized.config.address, 'Jr. San Martin 854');

  assert.throws(() => normalizeClaimsJobInput({ ...claimsInput, phone: '123' }), /telefono/);
  assert.throws(() => normalizeClaimsJobInput({ ...claimsInput, copies: 0 }), /copias/);
  assert.throws(() => normalizeClaimsJobInput({ ...claimsInput, copies: 500 }), /copias/);
});

test('genera etiqueta de reclamos rasterizada TSPL con copias configuradas', async () => {
  const { payload, labelCount } = await buildClaimsLabelsTspl({
    siteName: 'Satipo',
    phone: '937742137',
    address: 'Jr. San Martin 854',
    density: 8,
  }, 10);

  assert.equal(labelCount, 10);
  assert.ok(payload.startsWith('BASE64:'));
  const raw = Buffer.from(payload.slice(7), 'base64');
  assert.match(raw.toString('ascii', 0, 100), /BITMAP 0,0,50,304,0,/);
  assert.match(raw.toString('ascii', raw.length - 30), /PRINT 1,10/);
  assert.ok(raw.length > 15000);
});
