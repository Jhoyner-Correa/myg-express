import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import { assertDateOnly } from '../../../core/utils/time';
import {
  normalizeWorkCalendarInput,
  WorkCalendarEventType,
  WorkCalendarInput,
  WorkCalendarScope,
} from '../domain/workCalendarPolicy';
import { EffectiveSchedule, findEffectiveScheduleVersion } from './ScheduleService';

type CalendarRow = RowDataPacket & {
  id: number;
  alcance: WorkCalendarScope;
  sede_id: number | null;
  sede_nombre: string | null;
  nombre: string;
  tipo: WorkCalendarEventType;
  fecha_inicio: string | Date;
  fecha_fin: string | Date;
  horario_id: number | null;
  horario_nombre: string | null;
  descripcion: string | null;
  estado: 'ACTIVO' | 'CANCELADO';
  creado_por: number | null;
  created_at: Date;
};

export type WorkCalendarEvent = {
  id: number;
  scope: WorkCalendarScope;
  site_id: number | null;
  site_name: string | null;
  name: string;
  type: WorkCalendarEventType;
  start_date: string;
  end_date: string;
  schedule_id: number | null;
  schedule_name: string | null;
  description: string | null;
  status: 'ACTIVO' | 'CANCELADO';
  created_at: string;
};

export type ResolvedWorkDay = {
  working: boolean;
  reason: 'REGULAR' | 'FERIADO' | 'DIA_NO_LABORABLE' | 'JORNADA_ESPECIAL';
  event: WorkCalendarEvent | null;
  scheduleOverride: EffectiveSchedule | null;
};

function dateOnly(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function publicEvent(row: CalendarRow): WorkCalendarEvent {
  return {
    id: Number(row.id),
    scope: row.alcance,
    site_id: row.sede_id === null ? null : Number(row.sede_id),
    site_name: row.sede_nombre,
    name: String(row.nombre),
    type: row.tipo,
    start_date: dateOnly(row.fecha_inicio),
    end_date: dateOnly(row.fecha_fin),
    schedule_id: row.horario_id === null ? null : Number(row.horario_id),
    schedule_name: row.horario_nombre,
    description: row.descripcion,
    status: row.estado,
    created_at: new Date(row.created_at).toISOString(),
  };
}

const SELECT_EVENT = `SELECT event.id, event.alcance, event.sede_id, site.nombre AS sede_nombre,
                              event.nombre, event.tipo, event.fecha_inicio, event.fecha_fin,
                              event.horario_id, schedule.nombre AS horario_nombre,
                              event.descripcion, event.estado, event.creado_por, event.created_at
                         FROM personal_calendario_laboral event
                         LEFT JOIN sedes site ON site.id = event.sede_id
                         LEFT JOIN personal_horarios schedule ON schedule.id = event.horario_id`;

export async function resolveWorkDay(
  connection: PoolConnection,
  siteId: number,
  requestedDate: unknown,
): Promise<ResolvedWorkDay> {
  const date = assertDateOnly(requestedDate);
  const [rows] = await connection.query<CalendarRow[]>(
    `${SELECT_EVENT}
      WHERE event.estado = 'ACTIVO'
        AND event.fecha_inicio <= ? AND event.fecha_fin >= ?
        AND (event.sede_id = ? OR event.alcance = 'EMPRESA')
      ORDER BY event.alcance = 'SEDE' DESC, event.created_at DESC, event.id DESC
      LIMIT 1`,
    [date, date, siteId],
  );
  if (!rows.length) return { working: true, reason: 'REGULAR', event: null, scheduleOverride: null };

  const event = publicEvent(rows[0]);
  if (event.type !== 'JORNADA_ESPECIAL') {
    return { working: false, reason: event.type, event, scheduleOverride: null };
  }
  const scheduleOverride = await findEffectiveScheduleVersion(connection, Number(event.schedule_id), date);
  if (!scheduleOverride) {
    throw new Error(`La jornada especial "${event.name}" no tiene una version de horario vigente.`);
  }
  return { working: true, reason: 'JORNADA_ESPECIAL', event, scheduleOverride };
}

export class WorkCalendarService {
  async list(siteId: number | null, fromValue: unknown, untilValue: unknown) {
    const from = assertDateOnly(fromValue);
    const until = assertDateOnly(untilValue);
    if (until < from) throw new Error('El periodo de consulta no es valido.');
    const siteFilter = siteId === null ? '' : `AND (event.alcance = 'EMPRESA' OR event.sede_id = ?)`;
    const params = siteId === null ? [until, from] : [until, from, siteId];
    const [rows] = await pool.query<CalendarRow[]>(
      `${SELECT_EVENT}
        WHERE event.fecha_inicio <= ? AND event.fecha_fin >= ?
          ${siteFilter}
        ORDER BY event.fecha_inicio, event.alcance = 'SEDE' DESC, event.id`,
      params,
    );
    return rows.map(publicEvent);
  }

  async create(input: WorkCalendarInput, actorUserId: number) {
    const event = normalizeWorkCalendarInput(input);
    const id = await runInTransaction(async connection => {
      if (event.scheduleId !== null) {
        const schedule = await findEffectiveScheduleVersion(connection, event.scheduleId, event.startDate);
        if (!schedule) throw new Error('El horario elegido no tiene una version vigente para esa fecha.');
      }
      const [overlaps] = await connection.query<RowDataPacket[]>(
        `SELECT id, nombre FROM personal_calendario_laboral
          WHERE estado = 'ACTIVO'
            AND alcance = ? AND (alcance = 'EMPRESA' OR sede_id = ?)
            AND fecha_inicio <= ? AND fecha_fin >= ?
          LIMIT 1 FOR UPDATE`,
        [event.scope, event.siteId, event.endDate, event.startDate],
      );
      if (overlaps.length) {
        throw new Error(`El periodo se cruza con "${String(overlaps[0].nombre)}" en el mismo alcance.`);
      }
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO personal_calendario_laboral (
          alcance, sede_id, nombre, tipo, fecha_inicio, fecha_fin,
          horario_id, descripcion, creado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.scope, event.siteId, event.name, event.type, event.startDate, event.endDate,
          event.scheduleId, event.description, actorUserId],
      );
      await this.audit(connection, result.insertId, actorUserId, 'CREADO', event);
      return result.insertId;
    });
    return this.getById(id);
  }

  async cancel(id: number, actorUserId: number, scopedSiteId: number | null) {
    await runInTransaction(async connection => {
      const [rows] = await connection.query<CalendarRow[]>(
        `${SELECT_EVENT} WHERE event.id = ? ${scopedSiteId === null ? '' : "AND event.alcance = 'SEDE' AND event.sede_id = ?"}
          LIMIT 1 FOR UPDATE`,
        scopedSiteId === null ? [id] : [id, scopedSiteId],
      );
      if (!rows.length) throw new Error('Evento de calendario no encontrado o fuera de tu alcance.');
      if (rows[0].estado === 'CANCELADO') return;
      await connection.query(
        `UPDATE personal_calendario_laboral
            SET estado = 'CANCELADO', cancelado_por = ?, cancelado_at = NOW()
          WHERE id = ?`,
        [actorUserId, id],
      );
      await this.audit(connection, id, actorUserId, 'CANCELADO', publicEvent(rows[0]));
    });
    return this.getById(id);
  }

  private async getById(id: number) {
    const [rows] = await pool.query<CalendarRow[]>(`${SELECT_EVENT} WHERE event.id = ? LIMIT 1`, [id]);
    if (!rows.length) throw new Error('Evento de calendario no encontrado.');
    return publicEvent(rows[0]);
  }

  private async audit(
    connection: PoolConnection,
    eventId: number,
    actorUserId: number,
    result: string,
    metadata: unknown,
  ) {
    await connection.query(
      `INSERT INTO personal_auditoria_eventos (
        tipo_evento, usuario_id, exitoso, codigo_resultado, metadata_json
      ) VALUES ('CALENDARIO_LABORAL', ?, 1, ?, ?)`,
      [actorUserId, result, JSON.stringify({ calendar_event_id: eventId, ...(metadata as object) })],
    );
  }
}
