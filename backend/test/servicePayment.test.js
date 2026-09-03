const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateMonthlyAgreementBase, calculateMonthlyServiceBase, calculateServicePayment, classifyPaymentWorkQueue,
  evaluatePaymentControls, normalizePaymentMonth, parsePaymentAmount, planPaymentAgreementWrite,
} = require('../dist/modules/rrhh/domain/paymentDomain');

test('normaliza importes monetarios sin perder un cero', () => {
  assert.equal(parsePaymentAmount('1200'), 1200);
  assert.equal(parsePaymentAmount('1200,00'), 1200);
  assert.equal(parsePaymentAmount('1,200'), 1200);
  assert.equal(parsePaymentAmount('1.200,00'), 1200);
  assert.equal(parsePaymentAmount('1,200.50'), 1200.5);
  assert.equal(Number.isNaN(parsePaymentAmount('12abc')), true);
});

test('actualiza la vigencia actual y permite iniciar una nueva version cualquier dia', () => {
  assert.equal(planPaymentAgreementWrite({
    currentStart: '2026-09-01', requestedStart: '2026-09-01', today: '2026-09-03',
  }), 'UPDATE_CURRENT');
  assert.equal(planPaymentAgreementWrite({
    currentStart: '2026-09-01', requestedStart: '2026-10-01', today: '2026-09-03',
  }), 'CREATE_VERSION');
  assert.equal(planPaymentAgreementWrite({
    currentStart: '2026-09-01', requestedStart: '2026-09-05', today: '2026-09-03',
  }), 'CREATE_VERSION');
});

test('permite corregir una programacion futura a una fecha exacta del mes actual', () => {
  assert.equal(planPaymentAgreementWrite({
    currentStart: '2026-10-01', requestedStart: '2026-09-03', today: '2026-09-03',
  }), 'RESCHEDULE_FUTURE');
  assert.throws(() => planPaymentAgreementWrite({
    currentStart: '2026-08-01', requestedStart: '2026-07-01', today: '2026-09-03',
  }), /no puede retrocederse/);
});

test('suma los tramos de dos acuerdos cuando el honorario cambia a mitad de mes', () => {
  const result = calculateMonthlyAgreementBase({
    periodStart: '2026-09-01',
    employmentStart: '2026-01-01',
    employmentEnd: null,
    agreements: [
      { agreementId: 1, monthlyPayment: 1200, agreementStart: '2026-09-01', agreementEnd: '2026-09-04', policy: 'DIAS_CALENDARIO' },
      { agreementId: 2, monthlyPayment: 1500, agreementStart: '2026-09-05', agreementEnd: null, policy: 'DIAS_CALENDARIO' },
    ],
  });
  assert.equal(result.appliedMonthlyPayment, 1460);
  assert.equal(result.agreedMonthlyPayment, 1500);
  assert.equal(result.serviceDays, 30);
  assert.deepEqual(result.segments.map(segment => segment.appliedMonthlyPayment), [160, 1300]);
});

test('conserva el total mensual cuando cambia la vigencia pero no cambia el importe', () => {
  const result = calculateMonthlyAgreementBase({
    periodStart: '2026-09-01',
    employmentStart: '2026-01-01',
    agreements: [
      { agreementId: 1, monthlyPayment: 1200, agreementStart: '2026-09-01', agreementEnd: '2026-09-04', policy: 'HONORARIO_COMPLETO' },
      { agreementId: 2, monthlyPayment: 1200, agreementStart: '2026-09-05', agreementEnd: null, policy: 'HONORARIO_COMPLETO' },
    ],
  });
  assert.equal(result.appliedMonthlyPayment, 1200);
  assert.equal(result.segments.length, 2);
});

test('calcula pago mensual, horas extra y descuentos sin alterar el bruto del RHE', () => {
  const result = calculateServicePayment({
    monthlyPayment: 1500, overtimeMinutes: 90, overtimeHourlyRate: 12,
    otherIncome: 50, advances: 200, loanInstallments: 100, otherDiscounts: 0,
  });
  assert.deepEqual(result, {
    overtimeAmount: 18, serviceTotal: 1568, deductions: 300,
    depositTotal: 1268, hasExcessDeductions: false,
  });
});

test('no genera un deposito negativo', () => {
  const result = calculateServicePayment({
    monthlyPayment: 100, overtimeMinutes: 0, overtimeHourlyRate: 0,
    otherIncome: 0, advances: 150, loanInstallments: 0, otherDiscounts: 0,
  });
  assert.equal(result.depositTotal, 0);
  assert.equal(result.hasExcessDeductions, true);
});

test('normaliza solo periodos YYYY-MM validos', () => {
  assert.equal(normalizePaymentMonth('2026-08'), '2026-08-01');
  assert.throws(() => normalizePaymentMonth('2026-13'));
});

test('mantiene el honorario fijo cuando el colaborador cubre el mes completo', () => {
  const result = calculateMonthlyServiceBase({
    monthlyPayment: 1300,
    periodStart: '2026-08-01',
    employmentStart: '2025-08-15',
    employmentEnd: null,
    agreementStart: '2026-01-01',
    agreementEnd: null,
    policy: 'DIAS_CALENDARIO',
  });
  assert.equal(result.periodDays, 31);
  assert.equal(result.serviceDays, 31);
  assert.equal(result.appliedMonthlyPayment, 1300);
  assert.equal(result.prorated, false);
});

test('prorratea un ingreso parcial usando los dias calendario reales del mes', () => {
  const result = calculateMonthlyServiceBase({
    monthlyPayment: 1300,
    periodStart: '2026-08-01',
    employmentStart: '2026-08-16',
    employmentEnd: null,
    agreementStart: '2026-08-16',
    agreementEnd: null,
    policy: 'DIAS_CALENDARIO',
  });
  assert.equal(result.periodDays, 31);
  assert.equal(result.serviceDays, 16);
  assert.equal(result.appliedMonthlyPayment, 670.97);
  assert.equal(result.factor, 0.51612903);
  assert.equal(result.prorated, true);
});

test('respeta febrero bisiesto y permite honorario completo por politica explicita', () => {
  const result = calculateMonthlyServiceBase({
    monthlyPayment: 1500,
    periodStart: '2028-02-01',
    employmentStart: '2028-02-20',
    employmentEnd: null,
    policy: 'HONORARIO_COMPLETO',
  });
  assert.equal(result.periodDays, 29);
  assert.equal(result.serviceDays, 10);
  assert.equal(result.appliedMonthlyPayment, 1500);
  assert.equal(result.partialPeriod, true);
  assert.equal(result.prorated, false);
});

test('bloquea la revision cuando faltan cuenta bancaria o tarifa de sobretiempo', () => {
  const controls = evaluatePaymentControls({
    hasAgreement: true, hasLiquidation: true, overtimeMinutes: 90, overtimeHourlyRate: 0,
    bank: null, accountLast4: null, serviceTotal: 1500, depositTotal: 1500,
    liquidationStatus: 'BORRADOR', receiptSeries: null, receiptNumber: null,
    receiptAmount: null, paymentOperation: null,
  });
  assert.equal(controls.ready_for_review, false);
  assert.deepEqual(controls.pending_for_review, ['OVERTIME_RATE', 'BANK_ACCOUNT']);
});

test('diferencia controles de revision, lote bancario y deposito', () => {
  const controls = evaluatePaymentControls({
    hasAgreement: true, hasLiquidation: true, overtimeMinutes: 0, overtimeHourlyRate: 0,
    bank: 'BCP', accountLast4: '1234', serviceTotal: 1500, depositTotal: 1400,
    liquidationStatus: 'APROBADO', receiptSeries: 'E001', receiptNumber: '42',
    receiptAmount: 1500, paymentOperation: null,
  });
  assert.equal(controls.ready_for_review, true);
  assert.equal(controls.ready_for_batch, true);
  assert.equal(controls.payment_completed, false);
  assert.equal(controls.items.find(item => item.code === 'OVERTIME_RATE').state, 'NOT_REQUIRED');
});

test('clasifica liquidaciones en bandejas operativas sin depender del frontend', () => {
  assert.equal(classifyPaymentWorkQueue({
    liquidationStatus: 'CONFIGURACION_PENDIENTE', pendingForReview: ['AGREEMENT'], readyForBatch: false,
  }), 'OBSERVADOS');
  assert.equal(classifyPaymentWorkQueue({
    liquidationStatus: 'APROBADO', pendingForReview: [], readyForBatch: true,
  }), 'LISTOS_PARA_PAGO');
  assert.equal(classifyPaymentWorkQueue({
    liquidationStatus: 'EN_LOTE', pendingForReview: [], readyForBatch: true,
  }), 'EN_PAGO');
  assert.equal(classifyPaymentWorkQueue({
    liquidationStatus: 'PAGADO', pendingForReview: [], readyForBatch: true,
  }), 'PAGADOS');
});
