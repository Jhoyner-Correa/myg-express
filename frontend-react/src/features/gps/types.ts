export type GpsMovement = 'DETENIDO' | 'CAMINANDO' | 'VEHICULO';
export type GpsShiftState = 'SIN_INICIAR' | 'EN_JORNADA' | 'FINALIZADA';

export type GpsSiteScope = {
  id: number;
  name: string;
};

export type LiveGpsApiPosition = {
  empleado_id: number;
  latitud: number | string | null;
  longitud: number | string | null;
  velocidad_kmh: number | string | null;
  precision_gps: number | string | null;
  altitud: number | string | null;
  rumbo: number | string | null;
  estado_movimiento: GpsMovement | null;
  porcentaje_bateria: number | string | null;
  ultima_actualizacion: string | null;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  sexo: 'M' | 'F';
  foto: string | null;
  cargo_nombre: string;
  sede_id: number;
  sede_nombre: string;
  estado_jornada: GpsShiftState;
};

export type LiveGpsPosition = {
  employeeId: number;
  employeeCode: string;
  names: string;
  lastNames: string;
  gender: 'M' | 'F';
  photo: string | null;
  jobRole: string;
  siteId: number;
  siteName: string;
  latitude: number | null;
  longitude: number | null;
  speedKmh: number;
  accuracyMeters: number | null;
  movement: GpsMovement | null;
  batteryPercent: number | null;
  updatedAt: string | null;
  shiftState: GpsShiftState;
};

export type GpsHistoryApiPoint = {
  latitud: number | string;
  longitud: number | string;
  velocidad_kmh: number | string | null;
  precision_gps: number | string | null;
  estado_movimiento: GpsMovement;
  porcentaje_bateria: number | string | null;
  registrado_en: string;
};

export type GpsHistoryPoint = {
  latitude: number;
  longitude: number;
  speedKmh: number;
  accuracyMeters: number | null;
  movement: GpsMovement;
  batteryPercent: number | null;
  recordedAt: string;
};
