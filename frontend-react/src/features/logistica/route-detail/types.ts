export type NoticeItem = {
  id: number;
  nombre: string;
  telefono: string;
  codigo_paquete: string;
  estado_aviso: string;
  fecha_envio?: string;
  created_at: string;
};

export type QueueControl = {
  isProcessing?: boolean;
  isPaused?: boolean;
  hasInterruptedFlow?: boolean;
  lastError?: string;
  queuedCount?: number;
  processingJobs?: number;
  pausedJobs?: number;
};

export type RouteDetail = {
  id: number;
  sede_id: number;
  nombre_lote: string;
  origen: string;
  sede_nombre: string;
  fecha: string;
  estado: string;
  observacion: string;
  control_envio?: string | QueueControl;
};

export type TemplateItem = {
  id: number;
  nombre: string;
  cuerpo: string;
  adjunto_url?: string;
};

export type RawTemplateItem = {
  id: number;
  nombre: string;
  mensaje?: string;
  contenido?: string;
  imagen_path?: string;
  adjunto_url?: string;
};

export type SessionItem = {
  id: number;
  nombre: string;
  estado_real: string;
  nombre_dispositivo?: string;
  numero_whatsapp?: string;
};

export type ImportedNotice = {
  nombre: string;
  telefono: string;
  codigo_paquete: string;
  empresa_origen: string;
};

export type TemplateInput = {
  nombre: string;
  mensaje: string;
  sede_id?: number;
  imagen_base64?: string;
  imagen_nombre?: string;
  imagen_borrar?: boolean;
};

export type QueueAction = 'pausar' | 'reanudar' | 'manual' | 'cancelar';
