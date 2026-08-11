// ============================================================
// backend/src/modules/rrhh/domain/Marcacion.ts
// Entidad de Dominio que representa una Marcación individual
// ============================================================

export type ClockType = 'ENTRADA' | 'SALIDA_ALMUERZO' | 'REGRESO' | 'SALIDA';
export type ClockOrigin = 'GPS' | 'QR' | 'NFC' | 'BIOMETRICO';

export interface Marcacion {
  id: number;
  asistenciaId: number;
  dispositivoId: number | null;
  tipoMarcacion: ClockType;
  origenMarcacion: ClockOrigin;
  horaMarcacion: Date;
  latitud: number;
  longitud: number;
  precisionGps: number | null;
  selfiePath: string | null;
  redWifi: string | null;
  bluetooth: string | null;
  dentroDeRadio: boolean;
  createdAt?: Date;
}
