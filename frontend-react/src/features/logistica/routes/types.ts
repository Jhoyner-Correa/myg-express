export type RouteStatus = 'borrador' | 'pendiente' | 'procesando' | 'pausado' | 'completado' | 'cancelado';

export type RouteItem = {
  id: number;
  nombre_lote: string;
  zona?: string;
  origen?: string;
  sede_nombre?: string;
  total_registros: number;
  estado: RouteStatus | string;
  fecha: string;
  created_at: string;
  updated_at: string;
  finished_at?: string;
  fecha_finalizacion?: string;
  entregas_habilitado: number;
};

export type ZoneItem = {
  id: number;
  nombre: string;
};

export type RouteNoticeSummaryItem = {
  id?: number;
  nombre?: string;
  telefono?: string;
  codigo_paquete?: string;
  estado_aviso?: string;
};

export type ReportSummary = {
  total: number;
  enviados: number;
  pendientes: number;
  fallidos: number;
  manuales: number;
  sinWhatsapp: number;
  manualList: RouteNoticeSummaryItem[];
  nowaList: RouteNoticeSummaryItem[];
};
