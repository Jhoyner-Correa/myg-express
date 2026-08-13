// ============================================================
// backend/src/modules/rrhh/domain/Marcacion.ts
// Entidad de Dominio que representa una Marcación individual
// ============================================================

export type ClockType = 'ENTRADA' | 'SALIDA_ALMUERZO' | 'REGRESO' | 'SALIDA';
export type ClockOrigin = 'GPS' | 'QR' | 'NFC' | 'BIOMETRICO';
export type IdentityVerification = 'BIOMETRIA_DISPOSITIVO' | 'ADMINISTRATIVA' | 'NO_APLICA';

export interface Marcacion {
  id: number;
  requestId: string;
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
  distanciaSedeMetros: number;
  verificacionIdentidad: IdentityVerification;
  createdAt?: Date;
}
