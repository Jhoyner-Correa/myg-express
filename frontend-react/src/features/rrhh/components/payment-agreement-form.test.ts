import { describe, expect, it } from 'vitest';
import {
  agreementFormDefaults, applicationDate, canonicalCurrencyText, parseCurrencyText,
} from './payment-agreement-form';
import type { ServicePaymentRow } from '../types';

const payment = {
  acuerdo_configurado_id: 8,
  honorario_mensual_pactado: 120,
  pago_mensual: 120,
  tarifa_hora_extra: 0,
  politica_prorrateo: 'DIAS_CALENDARIO',
  banco: null,
  tipo_cuenta: null,
  acuerdo_actual_id: 12,
  acuerdo_actual_pago_mensual: 1200,
  acuerdo_actual_tarifa_hora_extra: 8.5,
  acuerdo_actual_politica_prorrateo: 'DIAS_CALENDARIO',
  acuerdo_actual_banco: 'BCP',
  acuerdo_actual_tipo_cuenta: 'AHORROS',
  acuerdo_actual_vigente_desde: '2026-09-01',
} as ServicePaymentRow;

describe('formulario de acuerdo económico', () => {
  it('conserva S/ 1,200 sin convertirlo en S/ 120', () => {
    expect(parseCurrencyText('1200')).toBe(1200);
    expect(parseCurrencyText('1200,00')).toBe(1200);
    expect(parseCurrencyText('1,200')).toBe(1200);
    expect(parseCurrencyText('1.200,00')).toBe(1200);
    expect(parseCurrencyText('1,200.50')).toBe(1200.5);
    expect(canonicalCurrencyText('1200')).toBe('1200.00');
  });

  it('prioriza el acuerdo editable real sobre la liquidación histórica', () => {
    const defaults = agreementFormDefaults(payment, '2026-09-03');
    expect(defaults.agreementId).toBe('12');
    expect(defaults.monthlyPayment).toBe('1200.00');
    expect(defaults.effectiveFrom).toBe('2026-09-01');
  });

  it('no propone octubre para actualizar el acuerdo de septiembre', () => {
    const defaults = agreementFormDefaults(payment, '2026-09-03');
    expect(applicationDate('CURRENT', defaults)).toBe('2026-09-01');
    expect(applicationDate('NEXT_MONTH', defaults)).toBe('2026-10-01');
  });

  it('reubica una programación futura al inicio del mes actual', () => {
    const defaults = agreementFormDefaults({
      ...payment,
      acuerdo_actual_vigente_desde: '2026-10-01',
    }, '2026-09-03');
    expect(defaults.effectiveFrom).toBe('2026-09-01');
  });
});
