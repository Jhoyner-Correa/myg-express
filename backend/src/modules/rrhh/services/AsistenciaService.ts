// ============================================================
// backend/src/modules/rrhh/services/AsistenciaService.ts
// Servicio de negocio para gestionar asistencia, horarios y tardanzas
// ============================================================

import { IAsistenciaRepository } from '../repositories/IAsistenciaRepository';
import { IMarcacionRepository } from '../repositories/IMarcacionRepository';
import { IEmpleadoRepository } from '../repositories/IEmpleadoRepository';
import { Asistencia } from '../domain/Asistencia';
import { Marcacion, ClockType, ClockOrigin } from '../domain/Marcacion';
import { pool } from '../../../core/database/database';
import { RowDataPacket } from 'mysql2/promise';
import { businessClockMinutes, businessDate, businessIsoWeekday, parseClockMinutes } from '../../../core/utils/time';

export class AsistenciaService {
  constructor(
    private asistenciaRepository: IAsistenciaRepository,
    private marcacionRepository: IMarcacionRepository,
    private empleadoRepository: IEmpleadoRepository
  ) {}

  /**
   * Registra una marcación de asistencia de un empleado y calcula tardanzas si corresponde.
   */
  async registrarMarcacion(params: {
    empleadoId: number;
    dispositivoId: number | null;
    tipo: ClockType;
    origen: ClockOrigin;
    latitud: number;
    longitud: number;
    precisionGps: number | null;
    selfiePath: string | null;
    wifi: string | null;
    bluetooth: string | null;
  }): Promise<{ marcacion: Marcacion; asistencia: Asistencia }> {
    
    // 1. Obtener datos del empleado
    const empleado = await this.empleadoRepository.buscarPorId(params.empleadoId);
    if (!empleado) {
      throw new Error('Empleado no encontrado');
    }

    if (empleado.estado !== 'ACTIVO') {
      throw new Error('El empleado no está activo en la empresa');
    }

    // 2. Verificar geolocalización (geocerca de la sede)
    let dentroDeRadio = true;
    const [configRows]: any = await pool.query(
      `SELECT latitud, longitud, radio_permitido_metros 
       FROM personal_configuracion_gps_sedes 
       WHERE sede_id = ? LIMIT 1`,
      [empleado.sedeId]
    );

    if (configRows.length > 0) {
      const config = configRows[0];
      const distancia = this.calcularDistanciaMetros(
        params.latitud,
        params.longitud,
        Number(config.latitud),
        Number(config.longitud)
      );

      if (distancia > Number(config.radio_permitido_metros)) {
        dentroDeRadio = false;
      }
    }

    // 3. Obtener o crear el registro de asistencia del día
    const now = new Date();
    const fechaHoy = businessDate(now);

    let asistencia = await this.asistenciaRepository.obtenerPorEmpleadoYFecha(
      params.empleadoId,
      fechaHoy
    );

    if (!asistencia) {
      const nuevaAsistenciaId = await this.asistenciaRepository.crear({
        empleadoId: params.empleadoId,
        fecha: new Date(fechaHoy),
        estadoAsistencia: 'PRESENTE',
        tipoAsistencia: 'NORMAL',
        minutosTardanza: 0
      });

      const recuperada = await this.asistenciaRepository.obtenerPorId(nuevaAsistenciaId);
      if (!recuperada) {
        throw new Error('Error al registrar la asistencia diaria');
      }
      asistencia = recuperada;
    }

    // 4. Registrar la marcación
    const nuevaMarcacionId = await this.marcacionRepository.crear({
      asistenciaId: asistencia.id,
      dispositivoId: params.dispositivoId,
      tipoMarcacion: params.tipo,
      origenMarcacion: params.origen,
      horaMarcacion: now,
      latitud: params.latitud,
      longitud: params.longitud,
      precisionGps: params.precisionGps,
      selfiePath: params.selfiePath,
      redWifi: params.wifi,
      bluetooth: params.bluetooth,
      dentroDeRadio
    });

    const marcaciones = await this.marcacionRepository.obtenerPorAsistencia(asistencia.id);
    const marcacionCreada = marcaciones.find(m => m.id === nuevaMarcacionId);

    if (!marcacionCreada) {
      throw new Error('Error al recuperar el registro de la marcación');
    }

    // 5. Si es entrada, evaluar tardanza contra horario
    if (params.tipo === 'ENTRADA') {
      const dayOfWeek = businessIsoWeekday(now);

      const [horarioRows]: any = await pool.query(
        `SELECT h.hora_entrada, h.tolerancia_minutos
         FROM personal_empleado_horarios eh
         INNER JOIN personal_horarios h ON eh.horario_id = h.id
         WHERE eh.empleado_id = ? AND eh.dia_semana = ?
         LIMIT 1`,
        [empleado.id, dayOfWeek]
      );

      if (horarioRows.length > 0) {
        const horario = horarioRows[0];
        const minutosEntrada = parseClockMinutes(String(horario.hora_entrada));
        const minutosTardanza = Math.max(0, businessClockMinutes(now) - minutosEntrada);

        if (minutosTardanza > Number(horario.tolerancia_minutos)) {
          // Es tardanza
          await this.asistenciaRepository.actualizar(asistencia.id, {
            estadoAsistencia: 'TARDANZA',
            minutosTardanza
          });
          asistencia.estadoAsistencia = 'TARDANZA';
          asistencia.minutosTardanza = minutosTardanza;
        }
      }
    }

    return {
      marcacion: marcacionCreada,
      asistencia
    };
  }

  async consultarAsistenciaPorSede(sedeId: number, fecha: string) {
    return await this.asistenciaRepository.listarPorSedeYFecha(sedeId, fecha);
  }

  /**
   * Fórmula de Haversine para calcular distancia en metros entre dos coordenadas GPS
   */
  private calcularDistanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Radio de la Tierra en metros
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}
