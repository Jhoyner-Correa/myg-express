import { formatDeliveryDate, routeLabel } from './domain';
import type { DeliveryClient, DeliveryPackage } from './types';

function csvEscape(value: unknown): string {
  const raw = String(value ?? '');
  const text = /^[=+\-@]/.test(raw.trimStart()) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildDeliveriesCsv(packages: DeliveryPackage[]): string {
  const headers = [
    'Cliente', 'Teléfono', 'Código', 'Fecha ingreso', 'Ruta', 'Zona', 'Peso kg',
    'Tamaño calculado', 'Rango tamaño', 'Tipo paquete Urbano', 'Piezas', 'Contenido',
    'Estado entrega', 'Fecha entrega', 'Observación',
  ];
  const rows = packages.map(item => [
    item.cliente, item.telefono, item.codigo_paquete, formatDeliveryDate(item.fecha_ingreso, true),
    routeLabel(item), item.ruta?.zona, item.peso_kg, item.tamano_paquete?.label,
    item.tamano_paquete?.rango, item.tipo_paquete_urbano, item.piezas,
    item.contenido_paquete, item.estado_entrega, formatDeliveryDate(item.fecha_entrega, true),
    item.observacion_entrega,
  ].map(csvEscape).join(','));
  return `\uFEFF${[headers.map(csvEscape).join(','), ...rows].join('\r\n')}`;
}

export function downloadDeliveriesCsv(client: DeliveryClient, packages: DeliveryPackage[]) {
  const blob = new Blob([buildDeliveriesCsv(packages)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `entregas_${client.nombre.trim().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
