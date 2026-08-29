export type PaymentAmounts = {
  monthlyPayment: number;
  overtimeMinutes: number;
  overtimeHourlyRate: number;
  otherIncome: number;
  advances: number;
  loanInstallments: number;
  otherDiscounts: number;
};

export type MonthlyProrationPolicy = 'DIAS_CALENDARIO' | 'HONORARIO_COMPLETO';

export type MonthlyServiceBaseInput = {
  monthlyPayment: number;
  periodStart: string;
  employmentStart: string;
  employmentEnd?: string | null;
  agreementStart?: string | null;
  agreementEnd?: string | null;
  policy: MonthlyProrationPolicy;
};

export type PaymentControlCode =
  | 'AGREEMENT'
  | 'OVERTIME_RATE'
  | 'BANK_ACCOUNT'
  | 'CALCULATION'
  | 'HONOR_RECEIPT'
  | 'DEPOSIT';

export type PaymentControlState = 'READY' | 'PENDING' | 'NOT_REQUIRED';

export type PaymentWorkQueue =
  | 'POR_REVISAR'
  | 'OBSERVADOS'
  | 'LISTOS_PARA_PAGO'
  | 'EN_PAGO'
  | 'PAGADOS';

export type PaymentControlInput = {
  hasAgreement: boolean;
  hasLiquidation: boolean;
  overtimeMinutes: number;
  overtimeHourlyRate: number;
  bank: string | null;
  accountLast4: string | null;
  serviceTotal: number;
  depositTotal: number;
  liquidationStatus: string | null;
  receiptSeries: string | null;
  receiptNumber: string | null;
  receiptAmount: number | null;
  paymentOperation: string | null;
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validDate(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} no valida.`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} no valida.`);
  }
  return value;
}

function monthEnd(periodStart: string): string {
  const date = new Date(`${periodStart}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function inclusiveDays(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function calculateMonthlyServiceBase(input: MonthlyServiceBaseInput) {
  if (!Number.isFinite(input.monthlyPayment) || input.monthlyPayment < 0) {
    throw new Error('Honorario mensual no valido.');
  }
  if (!['DIAS_CALENDARIO', 'HONORARIO_COMPLETO'].includes(input.policy)) {
    throw new Error('Politica de prorrateo no valida.');
  }
  const periodStart = validDate(input.periodStart, 'Periodo');
  if (!periodStart.endsWith('-01')) throw new Error('El periodo debe iniciar el primer dia del mes.');
  const periodFinish = monthEnd(periodStart);
  const employmentStart = validDate(input.employmentStart, 'Fecha de ingreso');
  const employmentEnd = input.employmentEnd ? validDate(input.employmentEnd, 'Fecha de cese') : periodFinish;
  const agreementStart = input.agreementStart ? validDate(input.agreementStart, 'Inicio del acuerdo') : periodStart;
  const agreementEnd = input.agreementEnd ? validDate(input.agreementEnd, 'Fin del acuerdo') : periodFinish;
  const serviceStart = [periodStart, employmentStart, agreementStart].sort().at(-1)!;
  const serviceEnd = [periodFinish, employmentEnd, agreementEnd].sort()[0];
  const periodDays = inclusiveDays(periodStart, periodFinish);
  const serviceDays = serviceStart <= serviceEnd ? inclusiveDays(serviceStart, serviceEnd) : 0;
  const isPartialPeriod = serviceDays > 0 && serviceDays < periodDays;
  const factor = serviceDays === 0 ? 0
    : input.policy === 'HONORARIO_COMPLETO' ? 1 : serviceDays / periodDays;
  const appliedMonthlyPayment = money(input.monthlyPayment * factor);

  return {
    agreedMonthlyPayment: money(input.monthlyPayment),
    appliedMonthlyPayment,
    periodDays,
    serviceDays,
    serviceStart: serviceDays ? serviceStart : null,
    serviceEnd: serviceDays ? serviceEnd : null,
    factor: Math.round(factor * 100_000_000) / 100_000_000,
    prorated: isPartialPeriod && input.policy === 'DIAS_CALENDARIO',
    partialPeriod: isPartialPeriod,
    policy: input.policy,
  };
}

export function calculateServicePayment(input: PaymentAmounts) {
  for (const [field, value] of Object.entries(input)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Importe no valido: ${field}`);
  }
  const overtimeAmount = money((input.overtimeMinutes / 60) * input.overtimeHourlyRate);
  const serviceTotal = money(input.monthlyPayment + overtimeAmount + input.otherIncome);
  const deductions = money(input.advances + input.loanInstallments + input.otherDiscounts);
  const depositTotal = money(Math.max(0, serviceTotal - deductions));
  return { overtimeAmount, serviceTotal, deductions, depositTotal, hasExcessDeductions: deductions > serviceTotal };
}

export function evaluatePaymentControls(input: PaymentControlInput) {
  const overtimeRequired = input.overtimeMinutes > 0;
  const calculationReady = input.hasLiquidation
    && Number.isFinite(input.serviceTotal)
    && Number.isFinite(input.depositTotal)
    && input.serviceTotal >= 0
    && input.depositTotal >= 0
    && input.depositTotal <= input.serviceTotal;
  const receiptReady = Boolean(
    input.receiptSeries
    && input.receiptNumber
    && input.receiptAmount !== null
    && Number.isFinite(input.receiptAmount)
    && Math.abs(Number(input.receiptAmount) - input.serviceTotal) <= 0.01,
  );
  const depositReady = input.liquidationStatus === 'PAGADO' && Boolean(input.paymentOperation);

  const items: Array<{ code: PaymentControlCode; state: PaymentControlState }> = [
    { code: 'AGREEMENT', state: input.hasAgreement ? 'READY' : 'PENDING' },
    {
      code: 'OVERTIME_RATE',
      state: overtimeRequired ? (input.overtimeHourlyRate > 0 ? 'READY' : 'PENDING') : 'NOT_REQUIRED',
    },
    { code: 'BANK_ACCOUNT', state: input.bank && input.accountLast4 ? 'READY' : 'PENDING' },
    { code: 'CALCULATION', state: calculationReady ? 'READY' : 'PENDING' },
    { code: 'HONOR_RECEIPT', state: receiptReady ? 'READY' : 'PENDING' },
    { code: 'DEPOSIT', state: depositReady ? 'READY' : 'PENDING' },
  ];
  const stateOf = (code: PaymentControlCode) => items.find(item => item.code === code)?.state;
  const reviewCodes: PaymentControlCode[] = ['AGREEMENT', 'OVERTIME_RATE', 'BANK_ACCOUNT', 'CALCULATION'];
  const batchCodes: PaymentControlCode[] = [...reviewCodes, 'HONOR_RECEIPT'];
  const pendingForReview = reviewCodes.filter(code => stateOf(code) === 'PENDING');
  const pendingForBatch = batchCodes.filter(code => stateOf(code) === 'PENDING');

  return {
    items,
    pending_for_review: pendingForReview,
    pending_for_batch: pendingForBatch,
    ready_for_review: pendingForReview.length === 0,
    ready_for_batch: pendingForBatch.length === 0,
    payment_completed: depositReady,
  };
}

export function classifyPaymentWorkQueue(input: {
  liquidationStatus: string | null;
  pendingForReview: PaymentControlCode[];
  readyForBatch: boolean;
}): PaymentWorkQueue {
  const status = String(input.liquidationStatus ?? 'PREVISUALIZACION').toUpperCase();
  if (status === 'PAGADO') return 'PAGADOS';
  if (status === 'EN_LOTE') return 'EN_PAGO';
  if (['CONFIGURACION_PENDIENTE', 'OBSERVADO'].includes(status) || input.pendingForReview.length > 0) {
    return 'OBSERVADOS';
  }
  if (status === 'APROBADO' && input.readyForBatch) return 'LISTOS_PARA_PAGO';
  return 'POR_REVISAR';
}

export function normalizePaymentMonth(value: unknown): string {
  const month = String(value ?? '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Periodo mensual no valido.');
  return `${month}-01`;
}
