export function toWhatsappUserMessage(error: unknown): string | null {
  const raw = String(error || '').trim();
  if (!raw) return null;

  const normalized = raw.toLowerCase();

  if (
    normalized.includes('connection closed') ||
    normalized.includes('stream errored') ||
    normalized.includes('device_removed') ||
    normalized.includes('connection replaced') ||
    normalized.includes('logged out') ||
    normalized.includes('unauthorized') ||
    normalized.includes('not connected') ||
    normalized.includes('disconnected')
  ) {
    return 'La sesión de WhatsApp se desconectó durante el envío. Reconecta o reemplaza el dispositivo y luego retoma la ruta.';
  }

  if (
    normalized.includes('blocked') ||
    normalized.includes('bloque') ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('status":429') ||
    normalized.includes('status 429')
  ) {
    return 'El envío fue pausado por protección de WhatsApp. Espera unos minutos y retoma la ruta con una sesión estable.';
  }

  if (
    normalized.includes('"exists":false') ||
    normalized.includes('exists:false') ||
    normalized.includes('not registered') ||
    normalized.includes('no tiene una cuenta')
  ) {
    return 'Algunos destinatarios no tienen WhatsApp registrado. Revisa el reporte de la ruta para gestionarlos manualmente.';
  }

  if (normalized.includes('envio pausado manualmente')) {
    return 'El envío fue pausado manualmente. Puedes retomarlo, registrar cierre manual o cancelar los pendientes.';
  }

  if (normalized.includes('{') || normalized.includes('internal server error') || normalized.includes('sendmedia')) {
    return 'El envío fue pausado por una incidencia técnica de WhatsApp. Verifica la sesión y retoma la ruta cuando esté conectada.';
  }

  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}
