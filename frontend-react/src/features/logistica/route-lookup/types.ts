export type ContractFilter = '' | 'temu' | 'no-temu';
export type LookupSort = 'default' | 'guia-asc' | 'cliente-asc' | 'localidad-asc';

export type RouteDestination = {
  id: number;
  nombre_lote: string;
  zona?: string;
  origen?: string;
  total_registros?: number;
  total_avisos?: number;
  estado: string;
  fecha: string;
};

export type UrbanoRecord = {
  routeId: string;
  guia: string;
  rastreo: string;
  cliente: string;
  telefono: string;
  contrato: string;
  localidad: string;
  peso_kg?: number | null;
  peso?: number | null;
  tipo_paquete_urbano?: string | null;
  tipo_paquete?: string | null;
  piezas?: number | null;
  contenido_paquete?: string | null;
  guia_contenido?: string | null;
};

export type RouteLookupResult = {
  routeId: string;
  totalGuias?: number;
  totalRegistros?: number;
  records: UrbanoRecord[];
};

export type LookupFilters = {
  locality: string;
  contract: ContractFilter;
  sort: LookupSort;
};

export type UrbanoStatus = {
  connected: boolean;
  username?: string;
};

export type CachedRouteLookup = {
  routeId: string;
  result: RouteLookupResult;
};

export type NoticeImport = {
  nombre: string | null;
  telefono: string;
  codigo_paquete: string | null;
  peso_kg: number | null;
  tipo_paquete_urbano: string | null;
  piezas: number | null;
  contenido_paquete: string | null;
  empresa_origen: 'Urbano';
  mensaje: null;
};

export const EMPTY_LOOKUP_FILTERS: LookupFilters = { locality: '', contract: '', sort: 'default' };
