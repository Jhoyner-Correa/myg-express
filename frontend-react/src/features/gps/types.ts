export type GpsMovement = 'DETENIDO' | 'CAMINANDO' | 'VEHICULO';

export type GpsSiteScope = {
  id: number;
  name: string;
};

export type LiveGpsApiPosition = {
  empleado_id: number;
  latitud: number | string;
  longitud: number | string;
  velocidad_kmh: number | string | null;
  precision_gps: number | string | null;
  altitud: number | string | null;
  rumbo: number | string | null;
  estado_movimiento: GpsMovement;
  porcentaje_bateria: number | string | null;
  ultima_actualizacion: string;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  cargo_nombre: string;
  sede_id: number;
  sede_nombre: string;
};

export type LiveGpsPosition = {
  employeeId: number;
  employeeCode: string;
  names: string;
  lastNames: string;
  jobRole: string;
  siteId: number;
  siteName: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  accuracyMeters: number | null;
  movement: GpsMovement;
  batteryPercent: number | null;
  updatedAt: string;
};
