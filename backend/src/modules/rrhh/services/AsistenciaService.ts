import { RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { businessClockMinutes, businessDate, businessIsoWeekday, parseClockMinutes } from '../../../core/utils/time';
import { Asistencia } from '../domain/Asistencia';
import { AttendanceRuleError, assertClockTransition, validateGeofence } from '../domain/attendancePolicy';
import { ClockOrigin, ClockType, IdentityVerification, Marcacion } from '../domain/Marcacion';
import { IAsistenciaRepository } from '../repositories/IAsistenciaRepository';
import { IEmpleadoRepository } from '../repositories/IEmpleadoRepository';
import { IMarcacionRepository } from '../repositories/IMarcacionRepository';
import { findEffectiveSchedule } from './ScheduleService';

type GeofenceRow = RowDataPacket & {
  latitud: string;
  longitud: string;
  radio_permitido_metros: number;
  precision_maxima_metros: string;
};

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RegisterAttendanceParams {
  requestId: string;
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
  verificacionIdentidad: IdentityVerification;
  occurredAt?: Date;
  actorUsuarioId?: number;
  ipAddress?: string | null;
}

export interface RegisterAttendanceResult {
  marcacion: Marcacion;
  asistencia: Asistencia;
  idempotentReplay: boolean;
}

export class AsistenciaService {
  constructor(
    private asistenciaRepository: IAsistenciaRepository,
    private marcacionRepository: IMarcacionRepository,
    private empleadoRepository: IEmpleadoRepository,
  ) {}

  async registrarMarcacion(params: RegisterAttendanceParams): Promise<RegisterAttendanceResult> {
    try {
      if (!REQUEST_ID_PATTERN.test(params.requestId)) {
        throw new AttendanceRuleError('REQUEST_ID_INVALID', 'request_id debe ser un UUID valido.', 400);
      }

      const empleado = await this.empleadoRepository.buscarPorId(params.empleadoId);
      if (!empleado) throw new AttendanceRuleError('EMPLOYEE_NOT_FOUND', 'Empleado no encontrado.', 404);
      if (empleado.estado !== 'ACTIVO') {
        throw new AttendanceRuleError('EMPLOYEE_INACTIVE', 'El empleado no esta activo en la empresa.', 403);
      }

      const result = await runInTransaction(async connection => {
        const previous = await this.marcacionRepository.obtenerPorRequestId(params.requestId, connection);
        if (previous) {
          const previousAttendance = await this.asistenciaRepository.obtenerPorId(previous.asistenciaId, connection);
          if (!previousAttendance || previousAttendance.empleadoId !== params.empleadoId || previous.tipoMarcacion !== params.tipo) {
            throw new AttendanceRuleError(
              'CLOCK_ALREADY_RECORDED',
              'request_id ya fue utilizado para otra operacion.',
              409,
            );
          }
          return { marcacion: previous, asistencia: previousAttendance, idempotentReplay: true };
        }

        const [geofenceRows] = await connection.query<GeofenceRow[]>(
          `SELECT latitud, longitud, radio_permitido_metros, precision_maxima_metros
             FROM personal_configuracion_gps_sedes
            WHERE sede_id = ?
            LIMIT 1`,
          [empleado.sedeId],
        );
        const geofence = geofenceRows.length ? {
          latitude: Number(geofenceRows[0].latitud),
          longitude: Number(geofenceRows[0].longitud),
          radiusMeters: Number(geofenceRows[0].radio_permitido_metros),
          maximumAccuracyMeters: Number(geofenceRows[0].precision_maxima_metros),
        } : null;
        const geofenceResult = validateGeofence(
          { latitude: params.latitud, longitude: params.longitud },
          params.precisionGps,
          geofence,
        );

        const now = params.occurredAt ?? new Date();
        if (!Number.isFinite(now.getTime())) {
          throw new AttendanceRuleError('INVALID_CAPTURE_TIME', 'La hora de la marcacion no es valida.', 400);
        }
        const attendanceDate = businessDate(now);
        const schedule = await findEffectiveSchedule(
          connection,
          empleado.id,
          attendanceDate,
          businessIsoWeekday(now),
        );
        let asistencia = await this.asistenciaRepository.obtenerOCrear({
          empleadoId: empleado.id,
          fecha: new Date(`${attendanceDate}T12:00:00`),
          estadoAsistencia: 'PRESENTE',
          tipoAsistencia: 'NORMAL',
          minutosTardanza: 0,
        }, connection);

        asistencia = await this.asistenciaRepository.obtenerPorEmpleadoYFecha(
          empleado.id,
          attendanceDate,
          connection,
          true,
        ) ?? asistencia;

        if (schedule) {
          await connection.query(
            `UPDATE personal_asistencias
                SET horario_version_id = COALESCE(horario_version_id, ?)
              WHERE id = ?`,
            [schedule.versionId, asistencia.id],
          );
        }

        const recordedMarks = await this.marcacionRepository.obtenerPorAsistencia(asistencia.id, connection);
        assertClockTransition(
          recordedMarks.map(mark => mark.tipoMarcacion),
          params.tipo,
          schedule?.lunchEnabled ?? true,
        );

        if (params.tipo === 'ENTRADA' && schedule) {
            const delayMinutes = Math.max(
              0,
              businessClockMinutes(now) - parseClockMinutes(schedule.startTime),
            );
            if (delayMinutes > schedule.toleranceMinutes) {
              await this.asistenciaRepository.actualizar(asistencia.id, {
                estadoAsistencia: 'TARDANZA',
                minutosTardanza: delayMinutes,
              }, connection);
              asistencia.estadoAsistencia = 'TARDANZA';
              asistencia.minutosTardanza = delayMinutes;
            }
        }

        const markId = await this.marcacionRepository.crear({
          requestId: params.requestId,
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
          dentroDeRadio: true,
          distanciaSedeMetros: geofenceResult.distanceMeters,
          verificacionIdentidad: params.verificacionIdentidad,
        }, connection);
        const created = (await this.marcacionRepository.obtenerPorAsistencia(asistencia.id, connection))
          .find(mark => mark.id === markId);
        if (!created) throw new Error('No se pudo recuperar la marcacion registrada.');

        await connection.query(
          `INSERT INTO personal_auditoria_eventos (
            tipo_evento, empleado_id, usuario_id, dispositivo_id, exitoso,
            codigo_resultado, ip_address, metadata_json
          ) VALUES ('MARCACION_ASISTENCIA', ?, ?, ?, 1, 'ACEPTADA', ?, ?)`,
          [
            empleado.id,
            params.actorUsuarioId ?? null,
            params.dispositivoId,
            params.ipAddress ?? null,
            JSON.stringify({ request_id: params.requestId, tipo: params.tipo }),
          ],
        );
        return { marcacion: created, asistencia, idempotentReplay: false };
      });

      return result;
    } catch (error) {
      await this.auditRejectedAttempt(params, error);
      throw error;
    }
  }

  async consultarAsistenciaPorSede(sedeId: number, fecha: string) {
    return this.asistenciaRepository.listarPorSedeYFecha(sedeId, fecha);
  }

  private async auditRejectedAttempt(params: RegisterAttendanceParams, error: unknown) {
    const code = error instanceof AttendanceRuleError ? error.code : 'ERROR_INTERNO';
    try {
      await pool.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, empleado_id, usuario_id, dispositivo_id, exitoso,
          codigo_resultado, ip_address, metadata_json
        ) VALUES ('MARCACION_ASISTENCIA', ?, ?, ?, 0, ?, ?, ?)`,
        [
          Number.isInteger(params.empleadoId) ? params.empleadoId : null,
          params.actorUsuarioId ?? null,
          params.dispositivoId,
          code,
          params.ipAddress ?? null,
          JSON.stringify({ request_id: params.requestId, tipo: params.tipo }),
        ],
      );
    } catch (auditError) {
      console.error('[RRHH] No se pudo auditar una marcacion rechazada:', auditError);
    }
  }
}
