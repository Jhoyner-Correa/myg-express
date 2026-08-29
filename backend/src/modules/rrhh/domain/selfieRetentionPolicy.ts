const DAY_MS = 24 * 60 * 60 * 1000;

export const SELFIE_RETENTION_DAYS = {
  pending: 7,
  rejected: 7,
} as const;

function addDays(value: Date, days: number): Date {
  if (!Number.isFinite(value.getTime())) throw new Error('Fecha de evidencia no valida.');
  return new Date(value.getTime() + days * DAY_MS);
}

export function pendingSelfieExpiresAt(capturedAt: Date): Date {
  return addDays(capturedAt, SELFIE_RETENTION_DAYS.pending);
}

export function rejectedSelfieExpiresAt(reviewedAt: Date): Date {
  return addDays(reviewedAt, SELFIE_RETENTION_DAYS.rejected);
}
