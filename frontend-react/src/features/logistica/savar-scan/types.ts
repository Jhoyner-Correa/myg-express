export type SavarLot = {
  nombre: string;
  fecha_creacion: string;
  total: number;
  recibidos: number;
  incidencias?: number;
};

export type SavarPackage = {
  id: number;
  codigo_paquete: string;
  codigo_escaneado?: string;
  consignado?: string;
  nombre?: string;
  direccion?: string;
  telefono?: string;
  departamento?: string;
  provincia?: string;
  distrito?: string;
  estado: string;
  lote_importacion?: string;
  fecha_escaneo?: string;
  fecha?: string;
};

export type ImportedPackage = {
  codigo: string;
  consignado: string;
  direccion: string;
  telefono: string;
  departamento: string;
  provincia: string;
  distrito: string;
};

export type ScanTone = 'neutral' | 'success' | 'error' | 'warning' | 'other-lote';
export type ScanFeedback = { tone: ScanTone; title: string; description: string };
export type SavarTab = 'escaneo' | 'reportes';
export type ExportStatus = 'LLEGÓ' | 'PENDIENTE';

export type ZoneTree = Record<string, {
  total: number;
  districts: Record<string, number>;
}>;
