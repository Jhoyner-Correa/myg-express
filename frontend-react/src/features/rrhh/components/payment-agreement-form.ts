import type { ServicePaymentRow } from '../types';

export type AgreementApplicationMode = 'CURRENT' | 'NEXT_MONTH' | 'CUSTOM';

export type AgreementFormDefaults = {
  agreementId: string;
  monthlyPayment: string;
  overtimeHourlyRate: string;
  prorationPolicy: ServicePaymentRow['politica_prorrateo'];
  bank: string;
  accountType: NonNullable<ServicePaymentRow['tipo_cuenta']>;
  effectiveFrom: string;
  currentEffectiveFrom: string | null;
  nextMonthEffectiveFrom: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function monthStart(date: string): string {
  if (!ISO_DATE.test(date)) throw new Error('Fecha inválida.');
  return `${date.slice(0, 7)}-01`;
}

export function nextMonthStart(date: string): string {
  const parsed = new Date(`${monthStart(date)}T12:00:00Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + 1);
  return parsed.toISOString().slice(0, 10);
}

export function sanitizeCurrencyText(value: string): string {
  return value.replace(/[^\d.,]/g, '').slice(0, 16);
}

export function parseCurrencyText(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let raw = String(value ?? '').trim().replace(/\s+/g, '').replace(/^S\/?/i, '');
  if (!raw || !/^\d[\d.,]*$/.test(raw)) return null;

  const lastDot = raw.lastIndexOf('.');
  const lastComma = raw.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimalIndex = Math.max(lastDot, lastComma);
    const decimals = raw.slice(decimalIndex + 1);
    if (decimals.length > 2) return null;
    raw = `${raw.slice(0, decimalIndex).replace(/[.,]/g, '')}.${decimals}`;
  } else {
    const separator = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
    if (separator) {
      const parts = raw.split(separator);
      const first = parts[0] ?? '';
      const groupedThousands = parts.length > 1 && first.length >= 1 && first.length <= 3
        && parts.slice(1).every(part => part.length === 3);
      if (groupedThousands) {
        raw = parts.join('');
      } else {
        const decimals = parts.pop() ?? '';
        if (decimals.length > 2 || parts.some(part => !part)) return null;
        raw = `${parts.join('')}.${decimals}`;
      }
    }
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
}

export function canonicalCurrencyText(value: unknown): string {
  const parsed = parseCurrencyText(value);
  return parsed === null ? String(value ?? '') : parsed.toFixed(2);
}

export function agreementFormDefaults(payment: ServicePaymentRow, today: string): AgreementFormDefaults {
  const agreementId = payment.acuerdo_actual_id ?? payment.acuerdo_configurado_id ?? null;
  const currentEffectiveFrom = payment.acuerdo_actual_vigente_desde
    ?? payment.acuerdo_vigente_desde
    ?? null;
  const currentMonth = monthStart(today);
  const effectiveFrom = currentEffectiveFrom && currentEffectiveFrom <= today
    ? currentEffectiveFrom
    : currentMonth;

  return {
    agreementId: agreementId ? String(agreementId) : '',
    monthlyPayment: canonicalCurrencyText(
      payment.acuerdo_actual_pago_mensual
      ?? payment.honorario_mensual_pactado
      ?? payment.pago_mensual
      ?? '',
    ),
    overtimeHourlyRate: canonicalCurrencyText(
      payment.acuerdo_actual_tarifa_hora_extra ?? payment.tarifa_hora_extra ?? 0,
    ),
    prorationPolicy: payment.acuerdo_actual_politica_prorrateo
      ?? payment.politica_prorrateo
      ?? 'DIAS_CALENDARIO',
    bank: payment.acuerdo_actual_banco ?? payment.banco ?? '',
    accountType: payment.acuerdo_actual_tipo_cuenta ?? payment.tipo_cuenta ?? 'AHORROS',
    effectiveFrom,
    currentEffectiveFrom,
    nextMonthEffectiveFrom: nextMonthStart(today),
  };
}

export function applicationDate(
  mode: AgreementApplicationMode,
  defaults: Pick<AgreementFormDefaults, 'effectiveFrom' | 'nextMonthEffectiveFrom'>,
): string {
  return mode === 'NEXT_MONTH' ? defaults.nextMonthEffectiveFrom : defaults.effectiveFrom;
}
