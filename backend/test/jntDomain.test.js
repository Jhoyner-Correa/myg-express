const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  cleanJntText,
  cleanJntCode,
  cleanJntPhone,
  cleanJntWeight,
  formatSpanishName,
  formatDistrictName,
  cleanJntAddress,
  parseJntPageText,
  aggregateConsignees,
  parseJntPdf,
  extractDateFromJntFilename,
  isMachineJntFilename,
  buildProfessionalJntBatchName
} = require('../dist/modules/logistica/domain/jntDomain');

test('cleanJntPhone normaliza teléfonos peruanos de 9 dígitos', () => {
  assert.equal(cleanJntPhone('945556310'), '945556310');
  assert.equal(cleanJntPhone('+51 945 556 310'), '945556310');
  assert.equal(cleanJntPhone('Tel: 945556310'), '945556310');
  assert.equal(cleanJntPhone('12345'), '');
});

test('formatSpanishName formatea nombres respetando mayúsculas y partículas', () => {
  assert.equal(formatSpanishName('dennys William Ortiz Tolentino'), 'Dennys William Ortiz Tolentino');
  assert.equal(formatSpanishName('ROSA MILENNYS PÉREZ SAJAJU'), 'Rosa Milennys Pérez Sajaju');
  assert.equal(formatSpanishName('Angeles de Dayana Puente Sinchi'), 'Angeles de Dayana Puente Sinchi');
  assert.equal(formatSpanishName('ana cristina mosquera pinchi'), 'Ana Cristina Mosquera Pinchi');
});

test('cleanJntWeight convierte cadenas con kg y comas a float redondeado', () => {
  assert.equal(cleanJntWeight('0.61 kg'), 0.61);
  assert.equal(cleanJntWeight('0,61 kg'), 0.61);
  assert.equal(cleanJntWeight('1.250kg'), 1.25);
  assert.equal(cleanJntWeight(null), null);
  assert.equal(cleanJntWeight('invalido'), null);
});

test('cleanJntText recorta espacios en blanco y longitud máxima', () => {
  assert.equal(cleanJntText('  Hola   Mundo  \n'), 'Hola Mundo');
  assert.equal(cleanJntText('1234567890', 5), '12345');
});

test('parseJntPageText parsea correctamente una etiqueta de muestra de J&T', () => {
  const sampleText = `
0.61 kg
Peso:
945556310
Piezas:
Coviriali/SATIPO/JUNIN
M02 M02- 188
Tel:
Firma de recepción:
Av. Elmer Faucett 2889/07031/CALLAO/CALLAO/07031
JPE000041146033
123456789
dress
1
Nombre:
Nombre:
/Tel:\t120602
SATIPO
C.P:
Gina Enrique Rivera
+5115100146
Valor declarado:
JPE000041146033
24/11/2026 11:10:14
Cont:
CAN417
satipo Bellavista a media cuadra ay una tienda
minimarket Liz
Comentarios:
POR LA IMPRESIÓN DE ESTA GUÍA
`;

  const parsed = parseJntPageText(sampleText, 1);
  assert.ok(parsed);
  assert.equal(parsed.pagina, 1);
  assert.equal(parsed.guia, 'JPE000041146033');
  assert.equal(parsed.consignado, 'Gina Enrique Rivera');
  assert.equal(parsed.telefono, '945556310');
  assert.equal(parsed.distrito, 'Coviriali');
  assert.equal(parsed.provincia, 'SATIPO');
  assert.equal(parsed.departamento, 'JUNIN');
  assert.equal(parsed.codigoRuta, 'M02 M02- 188');
  assert.equal(parsed.pesoKg, 0.61);
  assert.equal(parsed.contenido, 'dress');
  assert.equal(parsed.piezas, 1);
  assert.equal(parsed.codigoPostal, '120602');
  assert.equal(parsed.direccion, 'satipo Bellavista a media cuadra ay una tienda minimarket Liz');
});

test('parseJntPageText parsea correctamente una etiqueta de muestra con diseño alterno (Oxapampa / Layout B)', () => {
  const sampleTextB = `
JPE000047014425
0.31 kg
Valor declarado:
1
Piezas:
OXAPAMPA
Firma de recepción:
27/11/2026 10:34:13
Grecia Pamela Alegre
Fernández
Nombre:
Jr. Belgrado 2 Cdra N210
190301
Av. Elmer Faucett 2889/07031/CALLAO/CALLAO/07031
Cont:
plastic Baking m
+5115100146
Peso:
M02 M11-
JPE000047014425
958172557
Nombre: CAN417
123456789
Oxapampa/OXAPAMPA/PASCO
C.P: /Tel:
Tel:
Comentarios:
POR LA IMPRESIÓN DE ESTA GUÍA
`;

  const parsed = parseJntPageText(sampleTextB, 1);
  assert.ok(parsed);
  assert.equal(parsed.pagina, 1);
  assert.equal(parsed.guia, 'JPE000047014425');
  assert.equal(parsed.consignado, 'Grecia Pamela Alegre Fernández');
  assert.equal(parsed.telefono, '958172557');
  assert.equal(parsed.distrito, 'Oxapampa');
  assert.equal(parsed.provincia, 'OXAPAMPA');
  assert.equal(parsed.departamento, 'PASCO');
  assert.equal(parsed.pesoKg, 0.31);
  assert.equal(parsed.codigoPostal, '190301');
  assert.equal(parsed.direccion, 'Jr. Belgrado 2 Cdra N210');
  assert.equal(parsed.contenido, 'plastic Baking m');
});

test('parseJntPageText parsea consignado en la misma linea de Nombre con tabulacion', () => {
  const sampleTextB2 = `
JPE000051680845
0.75 kg
Valor declarado:
1
Piezas:
OXAPAMPA
Firma de recepción:
27/11/2026 10:34:13
Sandra Saciga Sandoval\tNombre:
Jr. Muller Mz. 269 Lt. 08
190301
Av. Elmer Faucett 2889/07031/CALLAO/CALLAO/07031
Cont:
T-shirts
+5115100146
Peso:
M02 M11-
JPE000051680845
964818086
Nombre: CAN417
123456789
Oxapampa/OXAPAMPA/PASCO
C.P: /Tel:
Tel:
Comentarios:
POR LA IMPRESIÓN DE ESTA GUÍA
`;

  const parsed = parseJntPageText(sampleTextB2, 3);
  assert.ok(parsed);
  assert.equal(parsed.pagina, 3);
  assert.equal(parsed.guia, 'JPE000051680845');
  assert.equal(parsed.consignado, 'Sandra Saciga Sandoval');
  assert.equal(parsed.telefono, '964818086');
  assert.equal(parsed.distrito, 'Oxapampa');
  assert.equal(parsed.direccion, 'Jr. Muller Mz. 269 Lt. 08');
  assert.equal(parsed.pesoKg, 0.75);
  assert.equal(parsed.contenido, 'T-shirts');
});

test('aggregateConsignees agrupa paquetes del mismo cliente', () => {
  const packages = [
    {
      pagina: 1,
      guia: 'JPE001',
      consignado: 'JUAN PEREZ',
      telefono: '999888777',
      distrito: 'SATIPO',
      provincia: 'SATIPO',
      departamento: 'JUNIN',
      direccion: 'Av 1',
      codigoRuta: 'M01',
      codigoPostal: '12001',
      pesoKg: 1.0,
      contenido: 'Ropa',
      piezas: 1
    },
    {
      pagina: 2,
      guia: 'JPE002',
      consignado: 'MARIA LOPEZ',
      telefono: '999111222',
      distrito: 'MAZAMARI',
      provincia: 'SATIPO',
      departamento: 'JUNIN',
      direccion: 'Av 2',
      codigoRuta: 'M02',
      codigoPostal: '12002',
      pesoKg: 0.5,
      contenido: 'Zapatos',
      piezas: 1
    },
    {
      pagina: 3,
      guia: 'JPE003',
      consignado: 'JUAN PEREZ',
      telefono: '999888777',
      distrito: 'SATIPO',
      provincia: 'SATIPO',
      departamento: 'JUNIN',
      direccion: 'Av 1',
      codigoRuta: 'M01',
      codigoPostal: '12001',
      pesoKg: 2.0,
      contenido: 'Juguetes',
      piezas: 1
    }
  ];

  const grouped = aggregateConsignees(packages);
  assert.equal(grouped.length, 2);
  // Juan Perez should be first because he has 2 packages
  assert.equal(grouped[0].consignado, 'JUAN PEREZ');
  assert.equal(grouped[0].totalPaquetes, 2);
  assert.deepEqual(grouped[0].guias, ['JPE001', 'JPE003']);
  assert.equal(grouped[1].consignado, 'MARIA LOPEZ');
  assert.equal(grouped[1].totalPaquetes, 1);
});

test('parseJntPdf procesa el archivo PDF real de 169 páginas con 100% de éxito', async (t) => {
  const pdfPath = 'C:/Users/JHOYNER/.gemini/antigravity/brain/df25fb7b-3a40-49d5-9c4a-0a3adabb0066/.user_uploaded/media_1795709039257_a3d4dc8a.pdf';
  if (!fs.existsSync(pdfPath)) {
    t.skip('Archivo PDF de prueba no encontrado en la ruta esperada');
    return;
  }

  const buffer = fs.readFileSync(pdfPath);
  const result = await parseJntPdf(buffer);

  assert.equal(result.totalPaginas, 169);
  assert.equal(result.totalPaquetes, 169);
  assert.equal(result.totalConsignados, 164);
  assert.equal(result.consignadosMultiples, 5);
  assert.equal(result.distritos['Satipo'], 111);
  assert.equal(result.distritos['Mazamari'], 53);
  assert.equal(result.distritos['Coviriali'], 1);
});

test('parseJntPdf procesa el archivo PDF real de 103 páginas de Oxapampa con 100% de éxito', async (t) => {
  const pdfPath = 'C:/Users/JHOYNER/.gemini/antigravity/brain/5818d650-cd79-4e3c-aff3-952b4819e394/.user_uploaded/media_1795800068492_1cc4b1a2.pdf';
  if (!fs.existsSync(pdfPath)) {
    t.skip('Archivo PDF de prueba de Oxapampa no encontrado en la ruta esperada');
    return;
  }

  const buffer = fs.readFileSync(pdfPath);
  const result = await parseJntPdf(buffer);

  assert.equal(result.totalPaginas, 103);
  assert.equal(result.totalPaquetes, 103);
  assert.equal(result.totalConsignados, 100);
  assert.equal(result.consignadosMultiples, 3);
  assert.ok(result.distritos['Oxapampa'] >= 90);
  assert.equal(result.distritos['27'], undefined);

  // Verificar que todas las guias tengan consignado, direccion y distrito validos
  for (const pkg of result.paquetes) {
    assert.ok(pkg.guia.startsWith('JPE'), `Guia invalida en pagina ${pkg.pagina}`);
    assert.ok(pkg.consignado.length > 2, `Consignado vacio en pagina ${pkg.pagina}`);
    assert.ok(pkg.direccion.length > 2, `Direccion vacia en pagina ${pkg.pagina}`);
    assert.ok(pkg.distrito.length > 2 && pkg.distrito !== '27', `Distrito invalido en pagina ${pkg.pagina}`);
  }
});

test('buildProfessionalJntBatchName ordena nombres técnicos de J&T automáticamente', () => {
  const machineName = 'aza365low730del_yl-jmsmx-ops-multiple-api_downloadCenter_20261124_pdf_338265089984680389.pdf';
  assert.equal(isMachineJntFilename(machineName), true);
  assert.equal(extractDateFromJntFilename(machineName), '24-11-2026');

  const formatted = buildProfessionalJntBatchName({
    originalFilename: machineName,
    distritos: { Satipo: 111, Mazamari: 53, Coviriali: 1 },
    totalPaquetes: 169,
    fallbackIsoDate: '2026-11-26'
  });
  assert.equal(formatted, 'J&T · 24-11-2026 · Satipo / Mazamari (169 guías)');

  const custom = buildProfessionalJntBatchName({
    originalFilename: machineName,
    customName: 'Ruta Satipo Tarde 26-11.pdf',
    distritos: { Satipo: 50 },
    totalPaquetes: 50,
    fallbackIsoDate: '2026-11-26'
  });
  assert.equal(custom, 'Ruta Satipo Tarde 26-11');

  const humanFile = buildProfessionalJntBatchName({
    originalFilename: 'Envios_Mazamari_Manana.pdf',
    distritos: { Mazamari: 30 },
    totalPaquetes: 30,
    fallbackIsoDate: '2026-11-26'
  });
  assert.equal(humanFile, 'Envios Mazamari Manana');
});
