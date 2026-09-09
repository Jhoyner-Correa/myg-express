import { createHash } from 'node:crypto';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { assertDateOnly, businessClockMinutes } from '../../../core/utils/time';
import { createEmployeeNotification } from '../../rrhh-mobile/mobileNotification.service';
import { calculatePartialAbsence } from '../domain/partialAbsencePolicy';
import { ServicePaymentService } from './ServicePaymentService';

export type PartialAbsenceStatus = 'PENDIENTE' | 'JUSTIFICADA' | 'DESCONTABLE' | 'COMPENSADA' | 'MIXTA' | 'INVALIDADA';

export type PartialAbsenceRecord = {
  id: number;
  attendance_id: number;
  employee_id: number;
  date: string;
  scheduled_minutes: number;
  covered_minutes: number;
  missed_minutes: number;
  justified_minutes: number;
  compensated_minutes: number;
  deductible_minutes: number;
  compensable_minutes: number;
  status: PartialAbsenceStatus;
  resolution_comment: string | null;
  resolved_by_name: string | null;
  resolved_at: Date | null;
};

type CalculationRow = RowDataPacket & {
  asistencia_id: number;
  empleado_id: number;
    fecha: string | Date;
  estado_asistencia: string;
  horario_version_id: number | null;
  hora_entrada: string | null;
  hora_salida: string | null;
  almuerzo_habilitado: number | null;
  salida_almuerzo_desde: string | null;
  duracion_almuerzo_minutos: number | null;
  tolerancia_entrada_minutos: number | null;
  tolerancia_retorno_minutos: number | null;
  entrada: Date | null;
  salida_almuerzo: Date | null;
  regreso: Date | null;
  salida: Date | null;
};

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} debe expresarse en minutos enteros.`);
  return parsed;
}

function resolutionStatus(justified: number, compensated: number, deductible: number): PartialAbsenceStatus {
  if (justified > 0 && compensated === 0 && deductible === 0) return 'JUSTIFICADA';
  if (compensated > 0 && justified === 0 && deductible === 0) return 'COMPENSADA';
  if (deductible > 0 && justified === 0 && compensated === 0) return 'DESCONTABLE';
  return 'MIXTA';
}

export class PartialAbsenceService {
  async reconcileAttendance(attendanceIdValue: unknown): Promise<PartialAbsenceRecord | null> {
    const attendanceId = positiveInteger(attendanceIdValue, 'Asistencia');
    if (attendanceId < 1) throw new Error('Asistencia no valida.');
    return runInTransaction(connection => this.syncAttendance(connection, attendanceId));
  }

  async syncAttendance(connection: PoolConnection, attendanceId: number): Promise<PartialAbsenceRecord | null> {
    const [[row]] = await connection.query<CalculationRow[]>(
      `SELECT attendance.id AS asistencia_id, attendance.empleado_id,
              DATE_FORMAT(attendance.fecha, '%Y-%m-%d') AS fecha, attendance.estado_asistencia,
              attendance.horario_version_id, version.hora_entrada, version.hora_salida,
              version.almuerzo_habilitado, version.salida_almuerzo_desde,
              version.duracion_almuerzo_minutos, version.tolerancia_entrada_minutos,
              version.tolerancia_retorno_minutos,
              marks.entrada, marks.salida_almuerzo, marks.regreso, marks.salida
         FROM personal_asistencias attendance
         LEFT JOIN personal_horario_versiones version ON version.id = attendance.horario_version_id
         LEFT JOIN (
           SELECT asistencia_id,
                  MIN(CASE WHEN tipo_marcacion = 'ENTRADA' THEN hora_marcacion END) AS entrada,
                  MIN(CASE WHEN tipo_marcacion = 'SALIDA_ALMUERZO' THEN hora_marcacion END) AS salida_almuerzo,
                  MIN(CASE WHEN tipo_marcacion = 'REGRESO' THEN hora_marcacion END) AS regreso,
                  MAX(CASE WHEN tipo_marcacion = 'SALIDA' THEN hora_marcacion END) AS salida
             FROM personal_marcaciones WHERE asistencia_id = ? GROUP BY asistencia_id
         ) marks ON marks.asistencia_id = attendance.id
        WHERE attendance.id = ? LIMIT 1`,
      [attendanceId, attendanceId],
    );
    if (!row) throw new Error('Asistencia no encontrada para calcular la inasistencia parcial.');

    const [existingRows] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM personal_inasistencias_parciales WHERE asistencia_id = ? LIMIT 1 FOR UPDATE',
      [attendanceId],
    );
    const existing = existingRows[0] ?? null;
    if (!['PRESENTE', 'TARDANZA'].includes(String(row.estado_asistencia))
      || !row.horario_version_id || !row.hora_entrada || !row.hora_salida || !row.entrada || !row.salida) {
      if (existing && String(existing.estado) !== 'INVALIDADA') {
        await connection.query(
          `UPDATE personal_inasistencias_parciales SET estado = 'INVALIDADA',
             minutos_justificados = 0, minutos_compensados = 0, minutos_descontables = 0,
             comentario_resolucion = NULL, resuelto_por = NULL, resuelto_en = NULL
           WHERE id = ?`,
          [existing.id],
        );
        await this.audit(connection, Number(row.empleado_id), null, 'INVALIDADA', {
          attendance_id: attendanceId, reason: 'JORNADA_NO_CALCULABLE', previous: existing,
        });
      }
      return null;
    }

    const calculation = calculatePartialAbsence({
      startTime: row.hora_entrada,
      endTime: row.hora_salida,
      lunchEnabled: Boolean(row.almuerzo_habilitado),
      lunchStartFrom: row.salida_almuerzo_desde,
      lunchDurationMinutes: Number(row.duracion_almuerzo_minutos || 0),
      entryToleranceMinutes: Number(row.tolerancia_entrada_minutos || 0),
      returnToleranceMinutes: Number(row.tolerancia_retorno_minutos || 0),
    }, {
      entry: businessClockMinutes(new Date(row.entrada)),
      lunchOut: row.salida_almuerzo ? businessClockMinutes(new Date(row.salida_almuerzo)) : null,
      lunchReturn: row.regreso ? businessClockMinutes(new Date(row.regreso)) : null,
      exit: businessClockMinutes(new Date(row.salida)),
    });
    const fingerprint = createHash('sha256').update(JSON.stringify({
      scheduleVersionId: Number(row.horario_version_id), calculation,
      marks: [row.entrada, row.salida_almuerzo, row.regreso, row.salida].map(value => value ? new Date(value).toISOString() : null),
    })).digest('hex');

    if (calculation.missedMinutes === 0) {
      if (existing && String(existing.estado) !== 'INVALIDADA') {
        await connection.query(
          `UPDATE personal_inasistencias_parciales SET estado = 'INVALIDADA',
             huella_calculo = ?, minutos_programados = ?, minutos_laborados_programados = ?,
             minutos_ausencia_detectados = 0, minutos_justificados = 0,
             minutos_compensados = 0, minutos_descontables = 0,
             comentario_resolucion = NULL, resuelto_por = NULL, resuelto_en = NULL
           WHERE id = ?`,
          [fingerprint, calculation.scheduledMinutes, calculation.coveredScheduledMinutes, existing.id],
        );
        await this.audit(connection, Number(row.empleado_id), null, 'INVALIDADA', {
          attendance_id: attendanceId, previous: existing,
        });
      }
      return null;
    }

    if (!existing) {
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_inasistencias_parciales (
          asistencia_id, empleado_id, fecha, horario_version_id, huella_calculo,
          minutos_programados, minutos_laborados_programados, minutos_ausencia_detectados
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [attendanceId, row.empleado_id, dateOnly(row.fecha), row.horario_version_id, fingerprint,
          calculation.scheduledMinutes, calculation.coveredScheduledMinutes, calculation.missedMinutes],
      );
      await this.audit(connection, Number(row.empleado_id), null, 'DETECTADA', {
        partial_absence_id: result.insertId, attendance_id: attendanceId, ...calculation,
      });
    } else if (String(existing.huella_calculo) !== fingerprint || String(existing.estado) === 'INVALIDADA') {
      await connection.query(
        `UPDATE personal_inasistencias_parciales SET horario_version_id = ?, huella_calculo = ?,
           minutos_programados = ?, minutos_laborados_programados = ?, minutos_ausencia_detectados = ?,
           minutos_justificados = 0, minutos_compensados = 0, minutos_descontables = 0,
           estado = 'PENDIENTE', comentario_resolucion = NULL, resuelto_por = NULL, resuelto_en = NULL
         WHERE id = ?`,
        [row.horario_version_id, fingerprint, calculation.scheduledMinutes,
          calculation.coveredScheduledMinutes, calculation.missedMinutes, existing.id],
      );
      await this.audit(connection, Number(row.empleado_id), null, 'RECALCULADA', {
        partial_absence_id: Number(existing.id), attendance_id: attendanceId,
        previous: existing, current: calculation,
      });
    }
    if (String((await this.getRow(connection, attendanceId))?.estado) === 'PENDIENTE') {
      await connection.query(
        `UPDATE personal_asistencias SET minutos_tardanza = ?
          WHERE id = ? AND estado_asistencia = 'TARDANZA'`,
        [calculation.missedMinutes, attendanceId],
      );
    }
    const current = await this.getRow(connection, attendanceId);
    return current ? this.publicRecord(current, await this.approvedOvertime(connection, attendanceId)) : null;
  }

  async resolve(siteId: number, actorUserId: number, input: Record<string, unknown>) {
    const attendanceId = positiveInteger(input.attendance_id, 'Asistencia');
    if (attendanceId < 1) throw new Error('Asistencia no válida.');
    const justified = positiveInteger(input.justified_minutes ?? 0, 'Minutos justificados');
    const compensated = positiveInteger(input.compensated_minutes ?? 0, 'Minutos compensados');
    const comment = String(input.comment ?? '').trim();
    if (comment.length < 8 || comment.length > 500) throw new Error('El sustento debe tener entre 8 y 500 caracteres.');

    const result = await runInTransaction(async connection => {
      const [scopeRows] = await connection.query<RowDataPacket[]>(
        `SELECT attendance.id, attendance.empleado_id, attendance.fecha,
                period.estado AS periodo_pago_estado
           FROM personal_asistencias attendance
           INNER JOIN personal_empleados employee ON employee.id = attendance.empleado_id
           INNER JOIN sedes site ON site.id = employee.sede_id
           LEFT JOIN personal_periodos_pago period
             ON period.empresa_id = site.empresa_id
            AND period.periodo = DATE_FORMAT(attendance.fecha, '%Y-%m-01')
          WHERE attendance.id = ? AND employee.sede_id = ? LIMIT 1 FOR UPDATE`,
        [attendanceId, siteId],
      );
      if (!scopeRows.length) throw new Error('Asistencia no encontrada dentro de la sede autorizada.');
      if (scopeRows[0].periodo_pago_estado && String(scopeRows[0].periodo_pago_estado) !== 'BORRADOR') {
        throw new Error('El periodo de pago ya no está en borrador. Reábrelo antes de modificar esta incidencia.');
      }
      const synced = await this.syncAttendance(connection, attendanceId);
      if (!synced || synced.status === 'INVALIDADA') throw new Error('La jornada no presenta una inasistencia parcial vigente.');
      const approvedOvertime = await this.approvedOvertime(connection, attendanceId);
      if (compensated > approvedOvertime) {
        throw new Error(`Solo puedes compensar hasta ${approvedOvertime} minutos de sobretiempo aprobado.`);
      }
      if (justified + compensated > synced.missed_minutes) {
        throw new Error('La suma justificada y compensada supera la ausencia detectada.');
      }
      const deductible = synced.missed_minutes - justified - compensated;
      const status = resolutionStatus(justified, compensated, deductible);
      await connection.query(
        `UPDATE personal_inasistencias_parciales SET minutos_justificados = ?,
           minutos_compensados = ?, minutos_descontables = ?, estado = ?,
           comentario_resolucion = ?, resuelto_por = ?, resuelto_en = NOW()
         WHERE id = ?`,
        [justified, compensated, deductible, status, comment, actorUserId, synced.id],
      );
      await this.audit(connection, synced.employee_id, actorUserId, status, {
        partial_absence_id: synced.id, attendance_id: attendanceId,
        detected_minutes: synced.missed_minutes, justified_minutes: justified,
        compensated_minutes: compensated, deductible_minutes: deductible, comment,
      });
      await createEmployeeNotification(connection, {
        employeeId: synced.employee_id,
        type: 'INASISTENCIA_PARCIAL_RESUELTA',
        title: 'Inasistencia parcial revisada',
        message: deductible > 0
          ? `RR. HH. confirmó ${deductible} minutos descontables de tu jornada del ${synced.date}.`
          : `RR. HH. resolvió sin descuento tu inasistencia parcial del ${synced.date}.`,
        priority: deductible > 0 ? 'IMPORTANTE' : 'INFO', action: 'HISTORIAL',
        referenceType: 'INASISTENCIA_PARCIAL', referenceId: synced.id,
        deduplicationKey: `INASISTENCIA_PARCIAL:${synced.id}:${status}:${justified}:${compensated}:${deductible}`,
      });
      return { ...synced, justified_minutes: justified, compensated_minutes: compensated,
        deductible_minutes: deductible, status };
    });
    await new ServicePaymentService().refreshDraftForAttendanceDecision(
      siteId, result.employee_id, result.date, actorUserId, 'INASISTENCIA_PARCIAL_RESUELTA',
    ).catch(() => undefined);
    return result;
  }

  async findByAttendance(attendanceId: number): Promise<PartialAbsenceRecord | null> {
    const connection = await pool.getConnection();
    try {
      const row = await this.getRow(connection, attendanceId);
      return row ? this.publicRecord(row, await this.approvedOvertime(connection, attendanceId)) : null;
    } finally { connection.release(); }
  }

  private async getRow(connection: PoolConnection, attendanceId: number) {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT partial_absence.*, reviewer.nombre AS resuelto_por_nombre
         FROM personal_inasistencias_parciales partial_absence
         LEFT JOIN usuarios reviewer ON reviewer.id = partial_absence.resuelto_por
        WHERE partial_absence.asistencia_id = ? LIMIT 1`,
      [attendanceId],
    );
    return rows[0] ?? null;
  }

  private async approvedOvertime(connection: PoolConnection, attendanceId: number): Promise<number> {
    const [[row]] = await connection.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(COALESCE(minutos_aprobados, minutos_detectados)), 0) AS minutes
         FROM personal_sobretiempo_solicitudes WHERE asistencia_id = ? AND estado = 'APROBADO'`,
      [attendanceId],
    );
    return Number(row?.minutes || 0);
  }

  private publicRecord(row: RowDataPacket, approvedOvertime: number): PartialAbsenceRecord {
    return {
      id: Number(row.id), attendance_id: Number(row.asistencia_id), employee_id: Number(row.empleado_id),
      date: dateOnly(row.fecha), scheduled_minutes: Number(row.minutos_programados),
      covered_minutes: Number(row.minutos_laborados_programados),
      missed_minutes: Number(row.minutos_ausencia_detectados),
      justified_minutes: Number(row.minutos_justificados), compensated_minutes: Number(row.minutos_compensados),
      deductible_minutes: Number(row.minutos_descontables), compensable_minutes: Math.min(Number(row.minutos_ausencia_detectados), approvedOvertime),
      status: String(row.estado) as PartialAbsenceStatus,
      resolution_comment: row.comentario_resolucion ? String(row.comentario_resolucion) : null,
      resolved_by_name: row.resuelto_por_nombre ? String(row.resuelto_por_nombre) : null,
      resolved_at: row.resuelto_en ? new Date(row.resuelto_en) : null,
    };
  }

  private async audit(connection: PoolConnection, employeeId: number, actorUserId: number | null, result: string, metadata: unknown) {
    await connection.query(
      `INSERT INTO personal_auditoria_eventos
        (tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json)
       VALUES ('INASISTENCIA_PARCIAL', ?, ?, 1, ?, ?)`,
      [employeeId, actorUserId, result, JSON.stringify(metadata)],
    );
  }
}

export const partialAbsenceService = new PartialAbsenceService();
