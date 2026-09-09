export type OvertimeCorrectionStatus = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'ANULADO';

export type OvertimeCorrectionAction =
  | 'CONSERVAR'
  | 'ACTUALIZAR_DETECCION'
  | 'REABRIR_REVISION'
  | 'ANULAR';

export function resolveOvertimeCorrection(input: {
  status: OvertimeCorrectionStatus;
  detectedMinutes: number;
  approvedMinutes: number | null;
  candidateMinutes: number | null;
}): OvertimeCorrectionAction {
  const detectedBefore = Math.max(0, Math.trunc(input.detectedMinutes));
  const approvedBefore = input.approvedMinutes;
  const candidate = input.candidateMinutes === null
    ? null
    : Math.max(0, Math.trunc(input.candidateMinutes));

  if (candidate === null) return input.status === 'ANULADO' ? 'CONSERVAR' : 'ANULAR';
  if (input.status === 'ANULADO') return 'REABRIR_REVISION';
  if (input.status === 'APROBADO' && Number(approvedBefore ?? 0) > candidate) return 'REABRIR_REVISION';
  return candidate === detectedBefore ? 'CONSERVAR' : 'ACTUALIZAR_DETECCION';
}

export function changesApprovedOvertimeAmount(
  status: OvertimeCorrectionStatus,
  action: OvertimeCorrectionAction,
) {
  return status === 'APROBADO' && (action === 'ANULAR' || action === 'REABRIR_REVISION');
}
