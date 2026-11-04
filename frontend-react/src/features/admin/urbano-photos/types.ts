export type UrbanoPhotoItem = {
  img_id: string;
  img_path: string;
  img_thumbs: string;
  img_tipo: string;
  img_fecha_hora: string;
  img_px: number | null;
  img_py: number | null;
  img_puntaje: number | null;
};

export type UrbanoGuidePhotoStatus =
  | 'CON_FOTOS'
  | 'SIN_FOTOS'
  | 'SIN_DETALLE_RUTA'
  | 'NO_ENCONTRADA'
  | 'ERROR';

export type UrbanoGuidePhotosResult = {
  guia: string;
  gui_numero: string | null;
  man_id_det: string | null;
  route_id: string | null;
  origen: string | null;
  destino: string | null;
  estado_rastreo: string | null;
  destinatario: string | null;
  direccion: string | null;
  fecha_consulta: string;
  status: UrbanoGuidePhotoStatus;
  error_mensaje?: string;
  fotos_count: number;
  fotos: UrbanoPhotoItem[];
};

export type UrbanoPhotosSummary = {
  total: number;
  conFotos: number;
  sinFotos: number;
  sinDetalleRuta: number;
  noEncontradas: number;
  errores: number;
};

export type AuditLogEntry = {
  id: number;
  usuario_id: number;
  usuario_nombre?: string;
  sede_id: number | null;
  guia: string;
  man_id_det: string | null;
  tipo_operacion: 'CONSULTA' | 'SUBIDA' | 'ELIMINACION';
  img_id: string | null;
  resultado: 'EXITOSO' | 'ERROR';
  mensaje: string | null;
  detalles_json: any;
  created_at: string;
};

export type UrbanoSiteOption = {
  id: number;
  name: string;
  integrationStatus: 'activo' | 'inactivo' | 'sin_configurar';
  available: boolean;
};

export type BulkPhotosResponse = {
  data: UrbanoGuidePhotosResult[];
  summary: UrbanoPhotosSummary;
};
