import type { NoticeItem, QueueControl, RouteDetail } from './types';

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Lima',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Lima',
});

export type NoticeVisualStatus = 'pendiente' | 'enviando' | 'enviado' | 'manual' | 'sin-whatsapp' | 'fallido';

export function formatDateOnly(value: string): string {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? DATE_FORMATTER.format(date) : value || '-';
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? DATE_TIME_FORMATTER.format(date).replace(',', ',')
    : value || '-';
}

export function normalizeAvisoVisualStatus(value: string): NoticeVisualStatus {
  const status = String(value || 'pendiente').toLowerCase();
  if (['processing', 'procesando', 'sending'].includes(status)) return 'enviando';
  if (['enviado', 'entregado', 'sent'].includes(status)) return 'enviado';
  if (['enviado_manual', 'manual'].includes(status)) return 'manual';
  if (['sin_whatsapp', 'no_whatsapp'].includes(status)) return 'sin-whatsapp';
  if (['fallido', 'error', 'auth_failure', 'fail', 'cancelado'].includes(status)) return 'fallido';
  return 'pendiente';
}

export function formatEstadoLabel(value: string): string {
  const status = String(value || 'pendiente').toLowerCase();
  if (status === 'auth_failure') return 'Error';
  if (status === 'processing') return 'Procesando';
  if (['sin_whatsapp', 'no_whatsapp'].includes(status)) return 'Sin WhatsApp';
  if (status === 'enviado_manual') return 'Manual';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getBadgeClass(value: string): string {
  const status = String(value || 'pendiente').toLowerCase();
  const classes: Record<string, string> = {
    enviado: 'completado',
    entregado: 'completado',
    activo: 'activo',
    completado: 'completado',
    progreso: 'progress',
    pausado: 'pausado',
    pendiente: 'pendiente',
    fallido: 'cancelado',
    cancelado: 'cancelado',
    error: 'cancelado',
    sin_whatsapp: 'pendiente',
  };
  return classes[status] ?? 'progress';
}

export function getBadgeLabel(value: string): string {
  const status = String(value || 'pendiente').toLowerCase();
  if (['sin_whatsapp', 'no_whatsapp'].includes(status)) return 'Pendiente';
  if (status === 'enviado_manual') return 'Manual';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function readQueueControl(route: RouteDetail | null): QueueControl | null {
  if (!route?.control_envio) return null;
  if (typeof route.control_envio === 'object') return route.control_envio;
  try {
    const parsed: unknown = JSON.parse(route.control_envio);
    return parsed && typeof parsed === 'object' ? parsed as QueueControl : null;
  } catch {
    return null;
  }
}

export function calculateRouteStats(notices: NoticeItem[]) {
  const total = notices.length;
  const counts = notices.reduce((result, notice) => {
    const status = normalizeAvisoVisualStatus(notice.estado_aviso);
    if (status === 'pendiente' || status === 'enviando') result.pending += 1;
    if (status === 'enviado' || status === 'manual') result.sent += 1;
    if (status === 'sin-whatsapp' || status === 'fallido') result.failed += 1;
    return result;
  }, { pending: 0, sent: 0, failed: 0 });
  const percentage = (value: number) => total > 0 ? Math.round((value / total) * 100) : 0;
  return {
    total,
    pendientes: counts.pending,
    enviados: counts.sent,
    fallidos: counts.failed,
    pendientesPct: percentage(counts.pending),
    enviadosPct: percentage(counts.sent),
    fallidosPct: percentage(counts.failed),
    procesados: counts.sent,
    procesadosPct: percentage(counts.sent),
  };
}

export function isManualClosureEligible(notice: NoticeItem): boolean {
  const status = String(notice.estado_aviso || 'pendiente').toLowerCase();
  return [
    'pendiente',
    'en_cola',
    'processing',
    'procesando',
    'fallido',
    'error',
    'auth_failure',
    'fail',
    'sin_whatsapp',
    'no_whatsapp',
  ].includes(status);
}

export function countManualClosureEligible(notices: NoticeItem[]): number {
  return notices.filter(isManualClosureEligible).length;
}
