export type DeliveryStatus = '' | 'pendiente' | 'recogido';
export type DeliveryDateFilter = '' | 'hoy' | 'ayer' | '7dias' | '30dias';

export type DeliveryFilters = {
  query: string;
  status: DeliveryStatus;
  date: DeliveryDateFilter;
  routeId: string;
};

export type DeliveryRouteOption = {
  id: number;
  nombre_lote: string;
};

export type DeliveryClient = {
  cliente_key: string;
  nombre: string;
  telefono: string | null;
  sede_nombre?: string;
  total: number;
  pendientes: number;
  recogidos: number;
  ultimo_ingreso: string | null;
  rutas_resumen?: string | null;
  coincidencia_codigo?: string | null;
};

export type PackageSize = {
  label: string;
  codigo: string;
  rango: string;
};

export type DeliveryPackage = {
  id: number;
  lote_id: number;
  codigo_paquete: string | null;
  fecha_ingreso: string;
  peso_kg: number | null;
  tipo_paquete_urbano?: string | null;
  tamano_paquete?: PackageSize | null;
  piezas?: number | null;
  contenido_paquete?: string | null;
  estado_entrega: 'pendiente' | 'recogido';
  fecha_entrega?: string | null;
  observacion_entrega?: string | null;
  ruta: { nombre?: string; zona?: string; id?: number };
  cliente?: string | null;
  telefono?: string | null;
  entregado_por?: string | null;
};

export type DeliveryStats = {
  total: number;
  pendientes: number;
  recogidos: number;
};

export const EMPTY_DELIVERY_FILTERS: DeliveryFilters = {
  query: '', status: '', date: '', routeId: '',
};

export const EMPTY_DELIVERY_STATS: DeliveryStats = {
  total: 0, pendientes: 0, recogidos: 0,
};
