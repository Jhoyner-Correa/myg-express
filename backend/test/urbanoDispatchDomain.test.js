const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseAdminSiteId,
  parseUrbanoGuide,
  parseUrbanoDispatchListQuery,
  parseUrbanoDispatchQuery,
  UrbanoDispatchValidationError,
} = require('../dist/modules/administrativo/domain/urbanoDispatchDomain');
const { normalizeDispatchGuide, normalizeDispatchSummary, normalizeGuideDetail } = require('../dist/services/urbanoService');

test('convierte el rango de fechas al formato que espera Urbano', () => {
  assert.deepEqual(parseUrbanoDispatchListQuery({
    from_date: '2026-08-30',
    to_date: '2026-09-03',
  }), {
    fromDate: '30/08/2026',
    toDate: '03/09/2026',
    line: 3,
  });
  assert.throws(
    () => parseUrbanoDispatchListQuery({ from_date: '2026-09-04', to_date: '2026-09-03' }),
    /fecha inicial/,
  );
});

test('normaliza el CDP y conserva sus parametros internos', () => {
  assert.deepEqual(normalizeDispatchSummary({
    id_despacho: '2452950',
    barra_des: 'CDP24529509',
    prov_des: '121',
    destino: 'STP',
    des_fecha_despacho: '01/09/2026',
    fecha_adm: '02/09/2026',
    nom_tipo_contenedor: 'PAQUETES',
    tot_guias: '48',
    tot_guias_ad: '0',
    tot_guias_adm: '48',
    tot_piezas: '55',
    tot_piezas_ad: '0',
    tot_piezas_adm: '55',
    tot_peso: '117.85',
    tot_peso_ad: '0.00',
    tot_peso_adm: '117.850',
  }), {
    id: '2452950',
    cdp: 'CDP24529509',
    destinationCode: '121',
    destination: 'STP',
    origin: '',
    dispatchedAt: '01/09/2026',
    admittedAt: '02/09/2026',
    containerType: 'PAQUETES',
    operator: '',
    status: '',
    totalGuides: 48,
    admittedGuides: 48,
    totalPieces: 55,
    admittedPieces: 55,
    totalWeightKg: 117.85,
    admittedWeightKg: 117.85,
    line: 3,
  });
});

test('normaliza una consulta de despachos Urbano y calcula el desplazamiento', () => {
  assert.deepEqual(parseUrbanoDispatchQuery({
    dispatch_id: ' 2452950 ',
    line: '99',
    page: '2',
    limit: '50',
  }), {
    dispatchId: '2452950',
    line: 3,
    page: 2,
    limit: 50,
    start: 50,
  });
});

test('aplica paginación segura por defecto', () => {
  const query = parseUrbanoDispatchQuery({ dispatch_id: '1' });
  assert.equal(query.line, 3);
  assert.equal(query.page, 1);
  assert.equal(query.limit, 500);
  assert.equal(query.start, 0);
});

test('rechaza identificadores y límites inválidos', () => {
  assert.throws(
    () => parseUrbanoDispatchQuery({ dispatch_id: '24-A' }),
    UrbanoDispatchValidationError,
  );
  assert.throws(
    () => parseUrbanoDispatchQuery({ dispatch_id: '2452950', limit: '30' }),
    /25, 50, 100 o 500/,
  );
  assert.throws(() => parseAdminSiteId('0'), UrbanoDispatchValidationError);
});

test('normaliza campos variables de Urbano sin exponer HTML', () => {
  const guide = normalizeDispatchGuide({
    GUIA_NUMERO: ' GUI-001 ',
    nom_destinatario: '<b>Ana Torres</b>',
    prov_des_nombre: 'Chanchamayo',
    estado_descripcion: 'EN RUTA',
    cantidad_piezas: '2',
    peso_total: '1,50 kg',
  }, 0);

  assert.equal(guide.guide, 'GUI-001');
  assert.equal(guide.recipient, 'Ana Torres');
  assert.equal(guide.destination, 'Chanchamayo');
  assert.equal(guide.status, 'EN RUTA');
  assert.equal(guide.pieces, 2);
  assert.equal(guide.weightKg, 1.5);
});

test('prioriza la guía WYB como identificador principal del envío', () => {
  const guide = normalizeDispatchGuide({
    guia: '47000086',
    guia_wyb: 'WYB470000864',
    guia_digit: 'WYB470000864',
    cod_rastreo: 'T155-00043691',
  }, 0);

  assert.equal(guide.guide, 'WYB470000864');
  assert.equal(guide.tracking, 'T155-00043691');
});

test('valida y normaliza el código de guía para consultar su ficha', () => {
  assert.equal(parseUrbanoGuide(' wyb469253287 '), 'WYB469253287');
  assert.throws(() => parseUrbanoGuide('46925328'), /guía WYB/);
  assert.throws(() => parseUrbanoGuide('WYB1&admin=true'), UrbanoDispatchValidationError);
});

test('normaliza la ficha completa de una guía Urbano', () => {
  const detail = normalizeGuideDetail({
    guia_texto: 'WYB469253287',
    rastreo: '47879534553',
    cliente: '<b>Victoria Morales</b>',
    telefonos: '964345107',
    e_mail: 'cliente@example.com',
    direccion: 'Jirón San Martín 354',
    localidad: 'SATIPO - JUNIN',
    origen: 'LIM',
    destino: 'STP',
    remite: 'Mercado Libre',
    piezas: '1',
    peso: '0.5800',
    estado: 'SALIO A ENTREGARSE',
    sub_estado: 'Courier asignado',
    servicio: 'Paquetería',
    seller: 'LAURA ventas',
    contrato: 'Paquetería',
    guia_contenido: 'Calzado',
    fecha_estimada: '03/09/2026',
    dir_px: '-11.252241',
    dir_py: '-74.637492',
    seguro_li: '1',
    valor_seguro_li: '120.50',
  }, 'WYB469253287');

  assert.equal(detail.guide, 'WYB469253287');
  assert.equal(detail.recipient, 'Victoria Morales');
  assert.equal(detail.phone, '964345107');
  assert.equal(detail.weightKg, 0.58);
  assert.equal(detail.latitude, -11.252241);
  assert.equal(detail.longitude, -74.637492);
  assert.equal(detail.insured, true);
  assert.equal(detail.insuranceValue, 120.5);
});
