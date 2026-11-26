export interface JntPackage {
  pagina: number;
  guia: string;
  consignado: string;
  telefono: string;
  distrito: string;
  provincia: string;
  departamento: string;
  direccion: string;
  codigoRuta: string;
  codigoPostal: string;
  pesoKg: number | null;
  contenido: string;
  piezas: number;
}

export interface JntConsigneeGroup {
  consignado: string;
  telefono: string;
  totalPaquetes: number;
  distrito: string;
  guias: string[];
  paquetes: JntPackage[];
}

export interface JntBatchHeader {
  id: number;
  sede_id: number;
  sede_nombre?: string;
  usuario_id: number;
  usuario_nombre?: string;
  nombre_archivo: string;
  total_paginas: number;
  total_paquetes: number;
  total_consignados: number;
  lote_carga_id: number | null;
  ruta_whatsapp_nombre?: string | null;
  ruta_whatsapp_estado?: string | null;
  created_at: string;
}

export interface JntBatchDetailData {
  lote?: JntBatchHeader;
  totalPaginas: number;
  totalPaquetes: number;
  totalConsignados: number;
  consignadosMultiples: number;
  distritos: Record<string, number>;
  paquetes: JntPackage[];
  consignados: JntConsigneeGroup[];
}

export interface JntAvailableRoute {
  id: number;
  sede_id: number;
  sede_nombre?: string;
  fecha: string;
  zona?: string;
  nombre_lote: string;
  estado: string;
  total_registros: number;
  created_at: string;
}

export interface JntWhatsAppCreatePayload {
  lote_jnt_id: number;
  lote_destino_id?: number | null;
  nombre_lote?: string;
  modo_agrupacion: 'individual' | 'agrupado_por_cliente';
  id_plantilla?: number | null;
  mensaje_personalizado?: string | null;
  distritos_filtro?: string[];
  guias_seleccionadas?: string[];
}

export interface JntSendToRouteResult {
  lote_carga_id: number;
  nombre_ruta: string;
  total_avisos: number;
  omitidos: number;
}
