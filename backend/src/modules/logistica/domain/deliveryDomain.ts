export type DeliveryClientIdentity = { n: string; t: string };

function single(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '');
  if (typeof value === 'object' && value !== null) return '';
  return String(value ?? '');
}

export function normalizeDeliveryText(value: unknown): string {
  return single(value).trim();
}

export function normalizeDeliveryDigits(value: unknown): string {
  return normalizeDeliveryText(value).replace(/\D/g, '');
}

export function parseDeliveryLimit(value: unknown, fallback: number, maximum: number): number {
  const text = single(value).trim();
  if (!text) return fallback;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), maximum);
}

export function makeDeliveryClientKey(normalizedName: string, phone: string): string {
  const payload: DeliveryClientIdentity = {
    n: normalizeDeliveryText(normalizedName).toLowerCase().slice(0, 255),
    t: normalizeDeliveryText(phone).slice(0, 50),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function parseDeliveryClientKey(key: unknown): DeliveryClientIdentity | null {
  const encoded = normalizeDeliveryText(key);
  if (!encoded || encoded.length > 2_048) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const record = parsed as Record<string, unknown>;
    const n = normalizeDeliveryText(record.n).toLowerCase().slice(0, 255);
    const t = normalizeDeliveryText(record.t).slice(0, 50);
    return n || t ? { n, t } : null;
  } catch {
    return null;
  }
}
