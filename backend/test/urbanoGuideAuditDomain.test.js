const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidUrbanoGuide,
  parseAttemptsAndMotives,
  parseRecipientSignatureAndDni,
  classifyGuideAudit,
  parseGuideAuditText,
  computeAuditSummaryKpis,
  UrbanoGuideAuditValidationError,
} = require('../dist/modules/administrativo/domain/urbanoGuideAuditDomain');

test('valida formatos de guías Urbano (WYB y ENU)', () => {
  assert.equal(isValidUrbanoGuide('WYB473662620'), true);
  assert.equal(isValidUrbanoGuide('wyb473662620'), true);
  assert.equal(isValidUrbanoGuide('ENU1149202'), true);
  assert.equal(isValidUrbanoGuide('enu1149202'), true);
  assert.equal(isValidUrbanoGuide('12345'), false);
  assert.equal(isValidUrbanoGuide('ABC473662620'), false);
  assert.equal(isValidUrbanoGuide(null), false);
});

test('extrae intentos y cantidad de motivos previos desde outForDelivery', () => {
  // 1 intento = 0 motivos
  assert.deepEqual(parseAttemptsAndMotives('Mie. 30-9 (1)'), { attempts: 1, motives: 0 });
  // 3 intentos = 2 motivos
  assert.deepEqual(parseAttemptsAndMotives('Vie. 18-9 (3)'), { attempts: 3, motives: 2 });
  // 2 intentos = 1 motivo
  assert.deepEqual(parseAttemptsAndMotives('Jue. 24-9 (2)'), { attempts: 2, motives: 1 });
  // PEND = 0 intentos, 0 motivos
  assert.deepEqual(parseAttemptsAndMotives('PEND'), { attempts: 0, motives: 0 });
  // Sin paréntesis = 1 intento por defecto
  assert.deepEqual(parseAttemptsAndMotives('Mie. 30-9'), { attempts: 1, motives: 0 });
  // Nulo o vacío
  assert.deepEqual(parseAttemptsAndMotives(null), { attempts: 0, motives: 0 });
});

test('extrae la firma y el DNI del receptor en statusDetail', () => {
  const r1 = parseRecipientSignatureAndDni('Firma:Jeremy Sanchez Valenzuela (DNI:44484630)');
  assert.equal(r1.signature, 'Jeremy Sanchez Valenzuela');
  assert.equal(r1.dni, '44484630');

  const r2 = parseRecipientSignatureAndDni('Firma:Rosaly Palomino Quiroz (DNI:75773728)');
  assert.equal(r2.signature, 'Rosaly Palomino Quiroz');
  assert.equal(r2.dni, '75773728');

  const r3 = parseRecipientSignatureAndDni('CIERRE DE GESTION');
  assert.equal(r3.signature, null);
  assert.equal(r3.dni, null);
});

test('clasifica una entrega limpia directa al primer intento', () => {
  const result = classifyGuideAudit({
    status: 'ENTREGA A TITULAR',
    statusDetail: 'Firma:Rosaly Palomino Quiroz (DNI:75773728)',
    dates: { outForDelivery: 'Mie. 30-9 (1)' },
  }, 'ENTREGADO');

  assert.equal(result.classification, 'ENTREGA_DIRECTA');
  assert.equal(result.isDiscrepancy, false);
  assert.equal(result.attempts, 1);
  assert.equal(result.motives, 0);
});

test('clasifica una entrega que tuvo 2 motivos previos y 3 intentos de salida a ruta', () => {
  const result = classifyGuideAudit({
    status: 'ENTREGA A TITULAR',
    statusDetail: 'Firma:Jeremy Sanchez Valenzuela (DNI:44484630)',
    dates: { outForDelivery: 'Vie. 18-9 (3)' },
  }, 'ENTREGADO');

  assert.equal(result.classification, 'ENTREGA_CON_MOTIVOS');
  assert.equal(result.isDiscrepancy, false);
  assert.equal(result.attempts, 3);
  assert.equal(result.motives, 2);
});

test('detecta discrepancia crítica cuando el Excel dice ENTREGADO pero en Urbano figura SE DEVOLVIO EL PRODUCTO', () => {
  const result = classifyGuideAudit({
    status: 'SE DEVOLVIO EL PRODUCTO',
    statusDetail: 'CIERRE DE GESTION',
    dates: { outForDelivery: 'PEND' },
  }, 'ENTREGADO');

  assert.equal(result.classification, 'DISCREPANCIA_NO_ENTREGADO');
  assert.equal(result.isDiscrepancy, true);
  assert.match(result.summaryText, /Falsa Entrega/i);
});

test('parsea texto plano con líneas de guías simples y deduplica', () => {
  const text = `
    WYB473662620
    wyb473653354
    WYB473662620
    ENU1149202
  `;
  const rows = parseGuideAuditText(text);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].guide, 'WYB473662620');
  assert.equal(rows[1].guide, 'WYB473653354');
  assert.equal(rows[2].guide, 'ENU1149202');
});

test('parsea filas completas copiadas de Excel (CSV) con proveedor, ruta y costo', () => {
  const csv = `
NOMBRE PROVEEDOR,NOMBRE AGENCIA,PLACA,SERVICIO,RUTA,FECHA RUTA,CUADRANTE,UBIGEO,SHIPPER,GUIA,ESTADO,CODIGO,PESO TOTAL GUIA NUEVO,PESO TOTAL GUIA ORIGINAL,PESO BASE GUIA,PESO KG ADIC GUIA,COSTO BASE GUIA ORIGINAL,COSTO BASE GUIA NUEVA,DIFERENCIA DE COSTO GUIA,COSTO KILO ADICIONAL GUIA,COSTO GUIA,IMAGENES,FECHA AO,FECHA DD,FECHA AD,HORA AD,PESO BALANZA,PESO VOL,RUC PROVEEDOR,X,%,APLICA,% APLCIADO,BONO / DCTO,ADICIONAL,TOTAL
PALOMINO CUBA GARY KIDNER,OXAMPAMPA II,C4-9931,Distribución,1148434,2026-09-30,Urbanas,OXAPAMPA,1306 - MARY KAY PERU S.R.L.,WYB473662620,ENTREGADO,,0.39,0.39,0.39,0,3,3,0,0,3,4,2026-09-28,2026-09-29,2026-09-30,12:36,0.39,0.99,10476022211,,,,,,,3
PALOMINO CUBA GARY KIDNER,Agencia Satipo,8495-3W,Distribución,1144777,2026-09-23,Urbanas,SAN MARTIN DE PORRES,5125 - MERCADO LIBRE,WYB465612843,ENTREGADO,,45,45,30,15,20,20,0,0,20,0,2026-08-04,2026-08-04,2026-08-27,01:44,45,43.2,10476022211,,,,,,,20
  `;
  const rows = parseGuideAuditText(csv);
  assert.equal(rows.length, 2);

  assert.equal(rows[0].guide, 'WYB473662620');
  assert.equal(rows[0].declaredProvider, 'PALOMINO CUBA GARY KIDNER');
  assert.equal(rows[0].declaredAgency, 'OXAMPAMPA II');
  assert.equal(rows[0].declaredRoute, '1148434');
  assert.equal(rows[0].declaredDate, '2026-09-30');
  assert.equal(rows[0].declaredStatus, 'ENTREGADO');
  assert.equal(rows[0].declaredCost, 3);

  assert.equal(rows[1].guide, 'WYB465612843');
  assert.equal(rows[1].declaredCost, 20);
});

test('calcula KPIs ejecutivos consolidados', () => {
  const sampleResults = [
    {
      guide: 'WYB1',
      found: true,
      declared: { cost: 3 },
      audit: { classification: 'ENTREGA_DIRECTA', attempts: 1, motives: 0 },
    },
    {
      guide: 'WYB2',
      found: true,
      declared: { cost: 3 },
      audit: { classification: 'ENTREGA_CON_MOTIVOS', attempts: 2, motives: 1 },
    },
    {
      guide: 'WYB3',
      found: true,
      declared: { cost: 20 },
      audit: { classification: 'DISCREPANCIA_NO_ENTREGADO', attempts: 0, motives: 0 },
    },
    {
      guide: 'WYB4',
      found: false,
      declared: { cost: 5 },
      audit: { classification: 'NO_ENCONTRADO', attempts: 0, motives: 0 },
    },
  ];

  const kpis = computeAuditSummaryKpis(sampleResults);
  assert.equal(kpis.total, 4);
  assert.equal(kpis.found, 3);
  assert.equal(kpis.notFound, 1);
  assert.equal(kpis.cleanDeliveries, 1);
  assert.equal(kpis.motivatedDeliveries, 1);
  assert.equal(kpis.motives1Attempt, 1);
  assert.equal(kpis.discrepancies, 1);
  assert.equal(kpis.totalDeclaredCost, 31);
  assert.equal(kpis.discrepantDeclaredCost, 20);
});

test('rechaza lotes vacíos o superiores al límite permitido', () => {
  assert.throws(() => parseGuideAuditText(''), UrbanoGuideAuditValidationError);
  assert.throws(() => parseGuideAuditText('texto sin guias'), UrbanoGuideAuditValidationError);
});
