// ============================================================
// backend/src/modules/gps/services/GpsService.ts
// Servicio de negocio para la gestión de ubicaciones y trayectos GPS
// ============================================================

import { MySqlGpsRepository } from '../repositories/mysql/MySqlGpsRepository';

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
  }): Promise<void> {
    
    // Validación básica de coordenadas geográficas
    if (params.latitud < -90 || params.latitud > 90) {
      throw new Error('Latitud fuera de rango (-90 a 90)');
    }
    if (params.longitud < -180 || params.longitud > 180) {
      throw new Error('Longitud fuera de rango (-180 a 180)');
    }

    await this.gpsRepository.registrarUbicacion({
      ...params,
      registradoEn: new Date()
    });
  }

  async obtenerUbicacionesTiempoReal(sedeId: number) {
    if (!sedeId || sedeId <= 0) {
      throw new Error('Sede inválida');
    }
    return await this.gpsRepository.obtenerTiempoRealPorSede(sedeId);
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
