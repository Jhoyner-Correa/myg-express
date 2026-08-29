// ============================================================
// backend/src/modules/gps/services/GpsService.ts
// Servicio de negocio para la gestión de ubicaciones y trayectos GPS
// ============================================================

import { MySqlGpsRepository } from '../repositories/mysql/MySqlGpsRepository';
import { businessDate, businessDateTime } from '../../../core/utils/time';

export class GpsService {
  constructor(private gpsRepository: MySqlGpsRepository) {}

  async obtenerSedeEmpleado(empleadoId: number): Promise<number> {
    if (!Number.isInteger(empleadoId) || empleadoId <= 0) {
      throw new Error('Empleado invalido');
    }
    const sedeId = await this.gpsRepository.obtenerSedeEmpleado(empleadoId);
    if (!sedeId) {
      throw new Error('Empleado no encontrado');
    }
    return sedeId;
  }

  async reportarUbicacion(params: {
    empleadoId: number;
    latitud: number;
    longitud: number;
    velocidadKmh: number;
    precisionGps: number | null;
    altitud: number | null;
    rumbo: number | null;
    estadoMovimiento: 'DETENIDO' | 'CAMINANDO' | 'VEHICULO';
    porcentajeBateria: number | null;
    ubicacionSimulada?: boolean;
    capturadoEn?: Date;
  }): Promise<void> {
    
    // Validación básica de coordenadas geográficas
    if (!Number.isInteger(params.empleadoId) || params.empleadoId <= 0) {
      throw new Error('Empleado inválido');
    }
    if (!Number.isFinite(params.latitud) || !Number.isFinite(params.longitud)) {
      throw new Error('Las coordenadas GPS no son válidas');
    }
    if (params.latitud < -90 || params.latitud > 90) {
      throw new Error('Latitud fuera de rango (-90 a 90)');
    }
    if (params.longitud < -180 || params.longitud > 180) {
      throw new Error('Longitud fuera de rango (-180 a 180)');
    }

    if (!Number.isFinite(params.velocidadKmh) || params.velocidadKmh < 0 || params.velocidadKmh > 250) {
      throw new Error('Velocidad GPS fuera de rango');
    }
    if (params.precisionGps !== null && (!Number.isFinite(params.precisionGps) || params.precisionGps < 0 || params.precisionGps > 500)) {
      throw new Error('Precisión GPS fuera de rango');
    }
    if (params.porcentajeBateria !== null && (!Number.isFinite(params.porcentajeBateria) || params.porcentajeBateria < 0 || params.porcentajeBateria > 100)) {
      throw new Error('Porcentaje de batería fuera de rango');
    }
    if (params.altitud !== null && (!Number.isFinite(params.altitud) || params.altitud < -500 || params.altitud > 10_000)) {
      throw new Error('Altitud GPS fuera de rango');
    }
    if (params.rumbo !== null && (!Number.isFinite(params.rumbo) || params.rumbo < 0 || params.rumbo > 360)) {
      throw new Error('Rumbo GPS fuera de rango');
    }
    if (!['DETENIDO', 'CAMINANDO', 'VEHICULO'].includes(params.estadoMovimiento)) {
      throw new Error('Estado de movimiento inválido');
    }
    if (params.ubicacionSimulada) {
      throw new Error('No se aceptan ubicaciones simuladas');
    }
    const registradoEn = params.capturadoEn ?? new Date();
    if (Number.isNaN(registradoEn.getTime())) throw new Error('Fecha de captura GPS invalida');
    const ageMilliseconds = Date.now() - registradoEn.getTime();
    if (ageMilliseconds < -5 * 60_000 || ageMilliseconds > 24 * 60 * 60_000) {
      throw new Error('Fecha de captura GPS fuera del periodo permitido');
    }
    await this.validarRastreoActivo(params.empleadoId, registradoEn);

    await this.gpsRepository.registrarUbicacion({
      empleadoId: params.empleadoId,
      latitud: params.latitud,
      longitud: params.longitud,
      velocidadKmh: params.velocidadKmh,
      precisionGps: params.precisionGps,
      altitud: params.altitud,
      rumbo: params.rumbo,
      estadoMovimiento: params.estadoMovimiento,
      porcentajeBateria: params.porcentajeBateria,
      registradoEn,
    });
  }

  async validarRastreoActivo(empleadoId: number, capturadoEn = new Date()): Promise<void> {
    if (!await this.gpsRepository.empleadoTieneRastreoContinuo(empleadoId)) {
      throw new Error('El colaborador no tiene habilitado el rastreo continuo');
    }
    if (!await this.gpsRepository.empleadoTieneJornadaActiva(
      empleadoId,
      businessDate(capturadoEn),
      businessDateTime(capturadoEn),
    )) {
      throw new Error('El rastreo requiere una jornada activa');
    }
  }

  async obtenerUbicacionesTiempoReal(sedeId: number | null) {
    if (sedeId !== null && (!Number.isInteger(sedeId) || sedeId <= 0)) {
      throw new Error('Sede inválida');
    }
    return await this.gpsRepository.obtenerTiempoRealPorSede(sedeId, businessDate());
  }

  async obtenerHistorialRecorrido(empleadoId: number, fecha: string) {
    if (!empleadoId || empleadoId <= 0) {
      throw new Error('Empleado inválido');
    }
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new Error('Fecha en formato incorrecto (debe ser YYYY-MM-DD)');
    }
    return await this.gpsRepository.obtenerHistorialEmpleado(empleadoId, fecha);
  }
}
