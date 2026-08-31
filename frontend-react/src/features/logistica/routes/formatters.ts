import type { RouteStatus } from './types';

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatRouteDateTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : DATE_TIME_FORMATTER.format(date);
}

export function routeStatusLabel(value: RouteStatus | string): string {
  switch (value) {
    case 'completado': return 'Finalizada';
    case 'procesando': return 'En proceso';
    case 'cancelado': return 'Cancelada';
    case 'pausado': return 'Pausada';
    default: return 'Pendiente';
  }
}

export function routeStatusTone(value: RouteStatus | string): 'success' | 'info' | 'danger' | 'muted' | 'warning' {
  switch (value) {
    case 'completado': return 'success';
    case 'procesando': return 'info';
    case 'cancelado': return 'danger';
    case 'pausado': return 'muted';
    default: return 'warning';
  }
}
