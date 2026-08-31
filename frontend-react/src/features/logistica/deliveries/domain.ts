import type { DeliveryPackage } from './types';

export function maskPhone(phone?: string | null): string {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.length < 6) return phone || 'Sin teléfono';
  return `${clean.slice(0, 3)} *** ${clean.slice(-3)}`;
}

export function formatDeliveryDate(value?: string | null, withTime = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatRelativeDeliveryDate(value?: string | null, now = new Date()): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const valueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((dayStart - valueStart) / 86_400_000);
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  return formatDeliveryDate(value);
}

export function formatWeight(value?: number | string | null): string {
  if (value === null || value === undefined || value === '') return 'Sin peso';
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 'Sin peso';
  return `${parsed.toFixed(parsed >= 10 ? 1 : 3).replace(/\.?0+$/, '')} kg`;
}

export function packageTypeLabel(item: DeliveryPackage): string {
  return item.tamano_paquete?.label || item.tipo_paquete_urbano || 'Sin tipo';
}

export function packageTypeCode(item: DeliveryPackage): string {
  return item.tamano_paquete?.codigo || 'sin_tipo';
}

export function packageDetail(item: DeliveryPackage): string {
  const parts: string[] = [];
  if (item.tamano_paquete?.rango) parts.push(item.tamano_paquete.rango);
  if (item.tipo_paquete_urbano) parts.push(`Urbano: ${item.tipo_paquete_urbano}`);
  if (Number(item.piezas) > 0) parts.push(`${item.piezas} ${item.piezas === 1 ? 'pieza' : 'piezas'}`);
  if (item.contenido_paquete) parts.push(item.contenido_paquete);
  return parts.join(' · ');
}

export function routeLabel(item?: DeliveryPackage | null): string {
  if (!item) return '—';
  return item.ruta?.nombre || `Ruta ${item.ruta?.id || item.lote_id || '—'}`;
}

export function splitPackages(packages: DeliveryPackage[]) {
  return {
    pending: packages.filter(item => item.estado_entrega === 'pendiente'),
    delivered: packages.filter(item => item.estado_entrega === 'recogido'),
  };
}

export function latestPackageDate(packages: DeliveryPackage[]) {
  return packages.reduce<string | null>((latest, item) => {
    if (!item.fecha_ingreso) return latest;
    if (!latest) return item.fecha_ingreso;
    return new Date(item.fecha_ingreso).getTime() > new Date(latest).getTime() ? item.fecha_ingreso : latest;
  }, null);
}
