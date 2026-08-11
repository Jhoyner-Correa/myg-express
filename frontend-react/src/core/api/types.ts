export type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  datos?: T;
  message?: string;
};

export function unwrapApiData<T>(envelope: ApiEnvelope<T>, fallback?: T): T {
  if (!envelope.ok) {
    throw new Error(envelope.message || 'La operación no pudo completarse.');
  }

  const value = envelope.data ?? envelope.datos ?? fallback;
  if (value === undefined) {
    throw new Error('La API devolvió una respuesta incompleta.');
  }
  return value;
}
