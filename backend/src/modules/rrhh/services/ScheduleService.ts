import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { assertDateOnly, businessDate, businessIsoWeekday } from '../../../core/utils/time';
import { normalizeSchedulePolicy, normalizeWeeklyAssignments, previousDate, SchedulePolicyInput, WeeklyScope } from '../domain/schedulePolicy';

export type ScheduleAssignmentInput = { weekday: number; scheduleId: number };

export type WeeklySchedulePolicy = {
  requested_scope: 'EMPRESA' | 'SEDE';
  source_scope: 'EMPRESA' | 'SEDE' | null;
  inherited: boolean;
  site_id: number | null;
  assignments: Array<{
    weekday: number;
    schedule_id: number;
    schedule_name: string;
    start_time: string;
    end_time: string;
    effective_from: string;
    effective_until: string | null;
  }>;
};

export type EffectiveSchedule = {
  scheduleId: number;
  versionId: number;
  version: number;
  name: string;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
  lunchEnabled: boolean;
  lunchStartFrom: string | null;
  lunchStartUntil: string | null;
  lunchDurationMinutes: number;
  returnToleranceMinutes: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

type EffectiveScheduleRow = RowDataPacket & {
  horario_id: number;
  version_id: number;
  numero_version: number;
  nombre: string;
  hora_entrada: string;
  hora_salida: string;
  tolerancia_entrada_minutos: number;
  almuerzo_habilitado: number;
  salida_almuerzo_desde: string | null;
  salida_almuerzo_hasta: string | null;
  duracion_almuerzo_minutos: number;
  tolerancia_retorno_minutos: number;
  vigente_desde: string | Date;
  vigente_hasta: string | Date | null;
};

function dateOnly(value: string | Date | null) {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function publicSchedule(row: EffectiveScheduleRow): EffectiveSchedule {
  return {
    scheduleId: Number(row.horario_id),
    versionId: Number(row.version_id),
    version: Number(row.numero_version),
    name: String(row.nombre),
    startTime: String(row.hora_entrada),
    endTime: String(row.hora_salida),
    toleranceMinutes: Number(row.tolerancia_entrada_minutos),
    lunchEnabled: Boolean(row.almuerzo_habilitado),
    lunchStartFrom: row.salida_almuerzo_desde ? String(row.salida_almuerzo_desde) : null,
    lunchStartUntil: row.salida_almuerzo_hasta ? String(row.salida_almuerzo_hasta) : null,
    lunchDurationMinutes: Number(row.duracion_almuerzo_minutos),
    returnToleranceMinutes: Number(row.tolerancia_retorno_minutos),
    effectiveFrom: dateOnly(row.vigente_desde)!,
    effectiveUntil: dateOnly(row.vigente_hasta),
  };
}

export async function findEffectiveScheduleVersion(
  connection: PoolConnection,
  scheduleId: number,
  date: string,
): Promise<EffectiveSchedule | null> {
  const [rows] = await connection.query<EffectiveScheduleRow[]>(
    `SELECT schedule.id AS horario_id, version.id AS version_id, version.numero_version,
            schedule.nombre, version.hora_entrada, version.hora_salida,
            version.tolerancia_entrada_minutos, version.almuerzo_habilitado,
            version.salida_almuerzo_desde, version.salida_almuerzo_hasta,
            version.duracion_almuerzo_minutos, version.tolerancia_retorno_minutos,
            version.vigente_desde, version.vigente_hasta
       FROM personal_horarios schedule
       INNER JOIN personal_horario_versiones version
         ON version.horario_id = schedule.id
        AND version.vigente_desde <= ?
        AND (version.vigente_hasta IS NULL OR version.vigente_hasta >= ?)
      WHERE schedule.id = ?
      ORDER BY version.vigente_desde DESC, version.numero_version DESC
      LIMIT 1`,
    [date, date, scheduleId],
  );
  return rows.length ? publicSchedule(rows[0]) : null;
}

export async function findEffectiveSchedule(
  connection: PoolConnection,
  employeeId: number,
  date: string,
  weekday: number,
): Promise<EffectiveSchedule | null> {
  const [rows] = await connection.query<EffectiveScheduleRow[]>(
    `SELECT schedule.id AS horario_id, version.id AS version_id, version.numero_version,
            schedule.nombre, version.hora_entrada, version.hora_salida,
            version.tolerancia_entrada_minutos, version.almuerzo_habilitado,
            version.salida_almuerzo_desde, version.salida_almuerzo_hasta,
            version.duracion_almuerzo_minutos, version.tolerancia_retorno_minutos,
            version.vigente_desde, version.vigente_hasta
       FROM personal_empleados employee
       INNER JOIN personal_horario_asignaciones assignment
         ON assignment.dia_semana = ?
        AND assignment.vigente_desde <= ?
        AND (assignment.vigente_hasta IS NULL OR assignment.vigente_hasta >= ?)
        AND (
          assignment.alcance = 'EMPRESA'
          OR (assignment.alcance = 'SEDE' AND assignment.sede_id = employee.sede_id)
          OR (assignment.alcance = 'EMPLEADO' AND assignment.empleado_id = employee.id)
        )
       INNER JOIN personal_horarios schedule ON schedule.id = assignment.horario_id
       INNER JOIN personal_horario_versiones version
         ON version.horario_id = schedule.id
        AND version.vigente_desde <= ?
        AND (version.vigente_hasta IS NULL OR version.vigente_hasta >= ?)
      WHERE employee.id = ?
      ORDER BY CASE assignment.alcance WHEN 'EMPLEADO' THEN 3 WHEN 'SEDE' THEN 2 ELSE 1 END DESC,
               assignment.vigente_desde DESC, version.vigente_desde DESC
      LIMIT 1`,
    [weekday, date, date, date, date, employeeId],
  );
  return rows.length ? publicSchedule(rows[0]) : null;
}

export class ScheduleService {
  async listSchedules() {
    const [rows] = await pool.query<(EffectiveScheduleRow & { estado: string })[]>(
      `SELECT schedule.id AS horario_id, version.id AS version_id, version.numero_version,
              schedule.nombre, schedule.estado, version.hora_entrada, version.hora_salida,
              version.tolerancia_entrada_minutos, version.almuerzo_habilitado,
              version.salida_almuerzo_desde, version.salida_almuerzo_hasta,
              version.duracion_almuerzo_minutos, version.tolerancia_retorno_minutos,
              version.vigente_desde, version.vigente_hasta
         FROM personal_horarios schedule
         INNER JOIN personal_horario_versiones version ON version.id = (
           SELECT candidate.id FROM personal_horario_versiones candidate
            WHERE candidate.horario_id = schedule.id
            ORDER BY candidate.vigente_desde DESC, candidate.numero_version DESC LIMIT 1
         )
        ORDER BY schedule.estado = 'ACTIVO' DESC, schedule.nombre`,
    );
    return rows.map(row => ({
      id: Number(row.horario_id),
      version_id: Number(row.version_id),
      version: Number(row.numero_version),
      name: String(row.nombre),
      status: String(row.estado),
      start_time: String(row.hora_entrada),
      end_time: String(row.hora_salida),
      tolerance_minutes: Number(row.tolerancia_entrada_minutos),
      lunch_enabled: Boolean(row.almuerzo_habilitado),
      lunch_start_from: row.salida_almuerzo_desde ? String(row.salida_almuerzo_desde) : null,
      lunch_start_until: row.salida_almuerzo_hasta ? String(row.salida_almuerzo_hasta) : null,
      lunch_duration_minutes: Number(row.duracion_almuerzo_minutos),
      return_tolerance_minutes: Number(row.tolerancia_retorno_minutos),
      effective_from: dateOnly(row.vigente_desde),
      effective_until: dateOnly(row.vigente_hasta),
    }));
  }

  async saveSchedule(id: number | null, input: SchedulePolicyInput, actorUserId: number) {
    const policy = normalizeSchedulePolicy(input);
    if (policy.effectiveFrom < businessDate()) {
      throw new Error('La vigencia del horario no puede comenzar en una fecha pasada.');
    }
    const scheduleId = await runInTransaction(async connection => {
      const [duplicateRows] = await connection.query<RowDataPacket[]>(
        `SELECT id FROM personal_horarios WHERE LOWER(TRIM(nombre)) = LOWER(?)
          AND (? IS NULL OR id <> ?) LIMIT 1`,
        [policy.name, id, id],
      );
      if (duplicateRows.length) throw new Error('Ya existe un horario con ese nombre.');

      if (id === null) {
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_horarios (
            nombre, hora_entrada, hora_salida, tolerancia_minutos, estado, creado_por
          ) VALUES (?, ?, ?, ?, 'ACTIVO', ?)`,
          [policy.name, policy.startTime, policy.endTime, policy.toleranceMinutes, actorUserId],
        );
        await this.insertVersion(connection, result.insertId, 1, policy, actorUserId);
        await this.audit(connection, result.insertId, actorUserId, 'CREADO', policy);
        return result.insertId;
      }

      const [scheduleRows] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM personal_horarios WHERE id = ? LIMIT 1 FOR UPDATE',
        [id],
      );
      if (!scheduleRows.length) throw new Error('Horario no encontrado.');
      const [versionRows] = await connection.query<RowDataPacket[]>(
        `SELECT id, numero_version, vigente_desde FROM personal_horario_versiones
          WHERE horario_id = ? ORDER BY vigente_desde DESC, numero_version DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      const latest = versionRows[0];
      const latestFrom = dateOnly(latest.vigente_desde)!;
      if (policy.effectiveFrom < latestFrom) {
        throw new Error(`La nueva versión debe iniciar después del ${latestFrom}.`);
      }
      if (policy.effectiveFrom === latestFrom) {
        const [usageRows] = await connection.query<RowDataPacket[]>(
          'SELECT id FROM personal_asistencias WHERE horario_version_id = ? LIMIT 1',
          [latest.id],
        );
        if (usageRows.length) {
          throw new Error('Esta versión ya fue utilizada. Programa el cambio para una fecha posterior.');
        }
        await connection.query(
          `UPDATE personal_horario_versiones SET hora_entrada = ?, hora_salida = ?,
            tolerancia_entrada_minutos = ?, almuerzo_habilitado = ?,
            salida_almuerzo_desde = ?, salida_almuerzo_hasta = ?,
            duracion_almuerzo_minutos = ?, tolerancia_retorno_minutos = ?, creado_por = ?
            WHERE id = ?`,
          [policy.startTime, policy.endTime, policy.toleranceMinutes, policy.lunchEnabled ? 1 : 0,
            policy.lunchStartFrom, policy.lunchStartUntil, policy.lunchDurationMinutes,
            policy.returnToleranceMinutes, actorUserId, latest.id],
        );
        await connection.query(
          `UPDATE personal_horarios SET nombre = ?, hora_entrada = ?, hora_salida = ?,
            tolerancia_minutos = ? WHERE id = ?`,
          [policy.name, policy.startTime, policy.endTime, policy.toleranceMinutes, id],
        );
        await this.audit(connection, id, actorUserId, 'ACTUALIZADO_SIN_USO', policy);
        return id;
      }
      await connection.query(
        `UPDATE personal_horario_versiones SET vigente_hasta = ?
          WHERE horario_id = ? AND numero_version = ?`,
        [previousDate(policy.effectiveFrom), id, Number(latest.numero_version)],
      );
      await connection.query(
        `UPDATE personal_horarios SET nombre = ?, hora_entrada = ?, hora_salida = ?,
          tolerancia_minutos = ? WHERE id = ?`,
        [policy.name, policy.startTime, policy.endTime, policy.toleranceMinutes, id],
      );
      await this.insertVersion(connection, id, Number(latest.numero_version) + 1, policy, actorUserId);
      await this.audit(connection, id, actorUserId, 'NUEVA_VERSION', policy);
      return id;
    });
    return (await this.listSchedules()).find(schedule => schedule.id === scheduleId);
  }

  async setScheduleStatus(id: number, status: unknown, actorUserId: number) {
    const normalized = String(status || '').toUpperCase();
    if (!['ACTIVO', 'INACTIVO'].includes(normalized)) throw new Error('Estado de horario no válido.');
    await runInTransaction(async connection => {
      const [result] = await connection.query<ResultSetHeader>(
        'UPDATE personal_horarios SET estado = ? WHERE id = ?',
        [normalized, id],
      );
      if (!result.affectedRows) throw new Error('Horario no encontrado.');
      await this.audit(connection, id, actorUserId, normalized, { status: normalized });
    });
    return (await this.listSchedules()).find(schedule => schedule.id === id);
  }

  async getWeeklyPolicy(
    scopeValue: unknown,
    siteIdValue: unknown,
    requestedDate: unknown = businessDate(),
  ): Promise<WeeklySchedulePolicy> {
    const scope = String(scopeValue || '').toUpperCase();
    if (!['EMPRESA', 'SEDE'].includes(scope)) throw new Error('El alcance semanal no es válido.');
    const requestedScope = scope as 'EMPRESA' | 'SEDE';
    const siteId = requestedScope === 'SEDE' ? Number(siteIdValue) : null;
    if (requestedScope === 'SEDE' && (!Number.isInteger(siteId) || Number(siteId) < 1)) {
      throw new Error('Selecciona una sede válida.');
    }
    const date = assertDateOnly(requestedDate);
    const direct = await this.listScopeAssignments(requestedScope, siteId, null, date);
    if (direct.length || requestedScope === 'EMPRESA') {
      return {
        requested_scope: requestedScope,
        source_scope: direct.length ? requestedScope : null,
        inherited: false,
        site_id: siteId,
        assignments: direct,
      };
    }
    const inherited = await this.listScopeAssignments('EMPRESA', null, null, date);
    return {
      requested_scope: 'SEDE',
      source_scope: inherited.length ? 'EMPRESA' : null,
      inherited: inherited.length > 0,
      site_id: siteId,
      assignments: inherited,
    };
  }

  async replaceWeeklyPolicy(
    scopeValue: unknown,
    siteIdValue: unknown,
    assignments: ScheduleAssignmentInput[],
    effectiveFromValue: unknown,
    actorUserId: number,
  ) {
    const scope = String(scopeValue || '').toUpperCase();
    if (!['EMPRESA', 'SEDE'].includes(scope)) throw new Error('El alcance semanal no es válido.');
    if (!assignments.length) throw new Error('Selecciona al menos un día laboral.');
    const siteId = scope === 'SEDE' ? Number(siteIdValue) : null;
    if (scope === 'SEDE' && (!Number.isInteger(siteId) || Number(siteId) < 1)) {
      throw new Error('Selecciona una sede válida.');
    }
    const effectiveFrom = await this.replaceAssignments(
      scope as WeeklyScope, siteId, null, assignments, effectiveFromValue, actorUserId,
    );
    return this.getWeeklyPolicy(scope, siteId, effectiveFrom);
  }

  async inheritCompanyWeeklyPolicy(siteIdValue: unknown, effectiveFromValue: unknown, actorUserId: number) {
    const siteId = Number(siteIdValue);
    if (!Number.isInteger(siteId) || siteId < 1) throw new Error('Selecciona una sede válida.');
    const effectiveFrom = await this.replaceAssignments(
      'SEDE', siteId, null, [], effectiveFromValue, actorUserId,
    );
    return this.getWeeklyPolicy('SEDE', siteId, effectiveFrom);
  }

  async getEmployeeSchedule(employeeId: number, requestedDate: unknown = businessDate()) {
    const date = assertDateOnly(requestedDate);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT assignment.dia_semana, assignment.horario_id, assignment.vigente_desde,
              assignment.vigente_hasta, schedule.nombre, version.hora_entrada, version.hora_salida
         FROM personal_horario_asignaciones assignment
         INNER JOIN personal_horarios schedule ON schedule.id = assignment.horario_id
         INNER JOIN personal_horario_versiones version
           ON version.horario_id = schedule.id AND version.vigente_desde <= ?
          AND (version.vigente_hasta IS NULL OR version.vigente_hasta >= ?)
        WHERE assignment.alcance = 'EMPLEADO' AND assignment.empleado_id = ?
          AND assignment.vigente_desde <= ?
          AND (assignment.vigente_hasta IS NULL OR assignment.vigente_hasta >= ?)
        ORDER BY assignment.dia_semana`,
      [date, date, employeeId, date, date],
    );
    return rows.map(row => ({
      weekday: Number(row.dia_semana),
      schedule_id: Number(row.horario_id),
      schedule_name: String(row.nombre),
      start_time: String(row.hora_entrada),
      end_time: String(row.hora_salida),
      effective_from: dateOnly(row.vigente_desde),
      effective_until: dateOnly(row.vigente_hasta),
    }));
  }

  async replaceEmployeeSchedule(
    employeeId: number,
    assignments: ScheduleAssignmentInput[],
    effectiveFromValue: unknown,
    actorUserId: number,
  ) {
    const effectiveFrom = await this.replaceAssignments(
      'EMPLEADO', null, employeeId, assignments, effectiveFromValue, actorUserId,
    );
    return this.getEmployeeSchedule(employeeId, effectiveFrom);
  }

  private async listScopeAssignments(
    scope: WeeklyScope,
    siteId: number | null,
    employeeId: number | null,
    date: string,
  ) {
    const { clause, values } = this.scopeWhere(scope, siteId, employeeId);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT assignment.dia_semana, assignment.horario_id, assignment.vigente_desde,
              assignment.vigente_hasta, schedule.nombre, version.hora_entrada, version.hora_salida
         FROM personal_horario_asignaciones assignment
         INNER JOIN personal_horarios schedule ON schedule.id = assignment.horario_id
         INNER JOIN personal_horario_versiones version
           ON version.horario_id = schedule.id
          AND version.vigente_desde <= ?
          AND (version.vigente_hasta IS NULL OR version.vigente_hasta >= ?)
        WHERE ${clause}
          AND assignment.vigente_desde <= ?
          AND (assignment.vigente_hasta IS NULL OR assignment.vigente_hasta >= ?)
        ORDER BY assignment.dia_semana`,
      [date, date, ...values, date, date],
    );
    return rows.map(row => ({
      weekday: Number(row.dia_semana),
      schedule_id: Number(row.horario_id),
      schedule_name: String(row.nombre),
      start_time: String(row.hora_entrada),
      end_time: String(row.hora_salida),
      effective_from: dateOnly(row.vigente_desde)!,
      effective_until: dateOnly(row.vigente_hasta),
    }));
  }

  private async replaceAssignments(
    scope: WeeklyScope,
    siteId: number | null,
    employeeId: number | null,
    assignments: ScheduleAssignmentInput[],
    effectiveFromValue: unknown,
    actorUserId: number,
  ) {
    const effectiveFrom = assertDateOnly(effectiveFromValue);
    if (effectiveFrom < businessDate()) throw new Error('La asignación no puede comenzar en una fecha pasada.');
    const normalized = normalizeWeeklyAssignments(assignments);
    const { clause, values } = this.scopeWhere(scope, siteId, employeeId);
    const writeClause = clause.split('assignment.').join('');

    await runInTransaction(async connection => {
      if (scope === 'SEDE') {
        const [siteRows] = await connection.query<RowDataPacket[]>('SELECT id FROM sedes WHERE id = ? LIMIT 1', [siteId]);
        if (!siteRows.length) throw new Error('Sede no encontrada.');
      } else if (scope === 'EMPLEADO') {
        const [employeeRows] = await connection.query<RowDataPacket[]>(
          'SELECT id FROM personal_empleados WHERE id = ? LIMIT 1', [employeeId],
        );
        if (!employeeRows.length) throw new Error('Empleado no encontrado.');
      }
      const scheduleIds = [...new Set(normalized.map(value => value.scheduleId))];
      if (scheduleIds.length) {
        const [scheduleRows] = await connection.query<RowDataPacket[]>(
          `SELECT schedule.id FROM personal_horarios schedule
            WHERE schedule.id IN (${scheduleIds.map(() => '?').join(',')}) AND schedule.estado = 'ACTIVO'
              AND EXISTS (SELECT 1 FROM personal_horario_versiones version
                WHERE version.horario_id = schedule.id AND version.vigente_desde <= ?
                  AND (version.vigente_hasta IS NULL OR version.vigente_hasta >= ?))`,
          [...scheduleIds, effectiveFrom, effectiveFrom],
        );
        if (scheduleRows.length !== scheduleIds.length) {
          throw new Error('Uno de los horarios no está activo o no tiene una versión vigente para esa fecha.');
        }
      }

      await connection.query(
        `UPDATE personal_horario_asignaciones SET vigente_hasta = ?
          WHERE ${writeClause} AND vigente_desde < ?
            AND (vigente_hasta IS NULL OR vigente_hasta >= ?)`,
        [previousDate(effectiveFrom), ...values, effectiveFrom, effectiveFrom],
      );
      await connection.query(
        `DELETE FROM personal_horario_asignaciones WHERE ${writeClause} AND vigente_desde >= ?`,
        [...values, effectiveFrom],
      );
      for (const assignment of normalized) {
        await connection.query(
          `INSERT INTO personal_horario_asignaciones (
            alcance, sede_id, empleado_id, horario_id, dia_semana,
            vigente_desde, vigente_hasta, creado_por
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
          [scope, siteId, employeeId, assignment.scheduleId, assignment.weekday, effectiveFrom, actorUserId],
        );
      }
      await connection.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, empleado_id, usuario_id, exitoso, codigo_resultado, metadata_json
        ) VALUES ('ASIGNACION_HORARIO', ?, ?, 1, ?, ?)`,
        [employeeId, actorUserId, normalized.length ? 'PROGRAMADA' : 'HEREDADA', JSON.stringify({
          scope, site_id: siteId, effective_from: effectiveFrom, assignments: normalized,
        })],
      );
    });
    return effectiveFrom;
  }

  private scopeWhere(scope: WeeklyScope, siteId: number | null, employeeId: number | null) {
    if (scope === 'EMPRESA') {
      return { clause: "assignment.alcance = 'EMPRESA' AND assignment.sede_id IS NULL AND assignment.empleado_id IS NULL", values: [] as unknown[] };
    }
    if (scope === 'SEDE') {
      return { clause: "assignment.alcance = 'SEDE' AND assignment.sede_id = ? AND assignment.empleado_id IS NULL", values: [siteId] as unknown[] };
    }
    return { clause: "assignment.alcance = 'EMPLEADO' AND assignment.sede_id IS NULL AND assignment.empleado_id = ?", values: [employeeId] as unknown[] };
  }

  private async insertVersion(
    connection: PoolConnection,
    scheduleId: number,
    version: number,
    policy: ReturnType<typeof normalizeSchedulePolicy>,
    actorUserId: number,
  ) {
    await connection.query(
      `INSERT INTO personal_horario_versiones (
        horario_id, numero_version, hora_entrada, hora_salida,
        tolerancia_entrada_minutos, almuerzo_habilitado,
        salida_almuerzo_desde, salida_almuerzo_hasta,
        duracion_almuerzo_minutos, tolerancia_retorno_minutos,
        vigente_desde, vigente_hasta, creado_por
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [scheduleId, version, policy.startTime, policy.endTime, policy.toleranceMinutes,
        policy.lunchEnabled ? 1 : 0, policy.lunchStartFrom, policy.lunchStartUntil,
        policy.lunchDurationMinutes, policy.returnToleranceMinutes, policy.effectiveFrom, actorUserId],
    );
  }

  private async audit(
    connection: PoolConnection,
    scheduleId: number,
    actorUserId: number,
    result: string,
    metadata: unknown,
  ) {
    await connection.query(
      `INSERT INTO personal_auditoria_eventos (
        tipo_evento, usuario_id, exitoso, codigo_resultado, metadata_json
      ) VALUES ('CONFIGURACION_HORARIO', ?, 1, ?, ?)`,
      [actorUserId, result, JSON.stringify({ schedule_id: scheduleId, policy: metadata })],
    );
  }
}
