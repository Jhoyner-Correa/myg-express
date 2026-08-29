// ============================================================
// backend/src/modules/rrhh/domain/Marcacion.ts
// Entidad de Dominio que representa una Marcación individual
// ============================================================

export type ClockType = 'ENTRADA' | 'SALIDA_ALMUERZO' | 'REGRESO' | 'SALIDA';
export type ClockOrigin = 'GPS' | 'QR' | 'NFC' | 'BIOMETRICO' | 'ADMINISTRATIVO';
export type IdentityVerification = 'BIOMETRIA_DISPOSITIVO' | 'SELFIE_REVISADA' | 'ADMINISTRATIVA' | 'NO_APLICA';
export type ClockTimingClassification = 'ANTICIPADA' | 'PUNTUAL' | 'TARDANZA' | 'DEMORADA' | 'SALIDA_ANTICIPADA' | 'SOBRETIEMPO_CANDIDATO';

export interface Marcacion {
  id: number;
  requestId: string;
  asistenciaId: number;
  dispositivoId: number | null;
  tipoMarcacion: ClockType;
  origenMarcacion: ClockOrigin;
  horaMarcacion: Date;
  horaProgramada: string | null;
  diferenciaProgramadaMinutos: number | null;
  clasificacionTiempo: ClockTimingClassification | null;
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
