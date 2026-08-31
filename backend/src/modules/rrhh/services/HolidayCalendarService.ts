import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';
import {
  HolidayDecisionInput,
  HolidayProposalDecision,
  normalizeHolidayDecision,
  normalizeHolidayYear,
} from '../domain/holidayCalendarPolicy';
import { findEffectiveScheduleVersion } from './ScheduleService';
import { HolidayProvider } from './HolidayProvider';

type ProposalState = 'PENDIENTE' | 'APROBADA' | 'DESCARTADA';

type ProposalRow = RowDataPacket & {
  id: number;
  proveedor: string;
  clave_externa: string;
  fecha: string | Date;
  nombre_local: string;
  nombre_internacional: string | null;
  tipo_fuente: string;
  es_nacional: number;
  subdivisiones_json: string | null;
  fuente_url: string;
  estado: ProposalState;
  decision: HolidayProposalDecision | null;
  evento_calendario_id: number | null;
  comentario_decision: string | null;
  decidido_por: number | null;
  decidido_at: Date | null;
  sincronizado_at: Date;
};

export type HolidayProposal = {
  id: number;
  provider: string;
  external_key: string;
  date: string;
  local_name: string;
  international_name: string | null;
  source_type: string;
  is_national: boolean;
  subdivisions: string[];
  source_url: string;
  status: ProposalState;
  decision: HolidayProposalDecision | null;
  calendar_event_id: number | null;
  decision_comment: string | null;
  decided_by: number | null;
  decided_at: string | null;
  synced_at: string;
};

const SELECT_PROPOSAL = `SELECT proposal.id, proposal.proveedor, proposal.clave_externa,
                                proposal.fecha, proposal.nombre_local, proposal.nombre_internacional,
                                proposal.tipo_fuente, proposal.es_nacional,
                                proposal.subdivisiones_json, proposal.fuente_url, proposal.estado,
                                proposal.decision, proposal.evento_calendario_id,
                                proposal.comentario_decision, proposal.decidido_por,
                                proposal.decidido_at, proposal.sincronizado_at
                           FROM personal_calendario_propuestas proposal`;

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function publicProposal(row: ProposalRow): HolidayProposal {
  return {
    id: Number(row.id),
    provider: row.proveedor,
    external_key: row.clave_externa,
    date: dateOnly(row.fecha),
    local_name: row.nombre_local,
    international_name: row.nombre_internacional,
    source_type: row.tipo_fuente,
    is_national: Boolean(row.es_nacional),
    subdivisions: parseStringArray(row.subdivisiones_json),
    source_url: row.fuente_url,
    status: row.estado,
    decision: row.decision,
    calendar_event_id: row.evento_calendario_id === null ? null : Number(row.evento_calendario_id),
    decision_comment: row.comentario_decision,
    decided_by: row.decidido_por === null ? null : Number(row.decidido_por),
    decided_at: row.decidido_at ? new Date(row.decidido_at).toISOString() : null,
    synced_at: new Date(row.sincronizado_at).toISOString(),
  };
}

export class HolidayCalendarService {
  constructor(private readonly provider = new HolidayProvider()) {}

  async list(yearValue: unknown): Promise<HolidayProposal[]> {
    const year = normalizeHolidayYear(yearValue);
    const [rows] = await pool.query<ProposalRow[]>(
      `${SELECT_PROPOSAL}
        WHERE proposal.fecha BETWEEN ? AND ?
        ORDER BY proposal.fecha, proposal.id`,
      [`${year}-01-01`, `${year}-12-31`],
    );
    return rows.map(publicProposal);
  }

  async synchronize(yearValue: unknown, actorUserId: number) {
    const year = normalizeHolidayYear(yearValue);
    const holidays = await this.provider.getPeruHolidays(year);
    const summary = await runInTransaction(async connection => {
      let inserted = 0;
      let refreshed = 0;
      for (const holiday of holidays) {
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_calendario_propuestas (
             proveedor, clave_externa, pais_codigo, fecha, nombre_local,
             nombre_internacional, tipo_fuente, es_nacional,
             subdivisiones_json, fuente_url, payload_json, sincronizado_at
           ) VALUES (?, ?, 'PE', ?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             fecha = VALUES(fecha), nombre_local = VALUES(nombre_local),
             nombre_internacional = VALUES(nombre_internacional),
             tipo_fuente = VALUES(tipo_fuente), es_nacional = VALUES(es_nacional),
             subdivisiones_json = VALUES(subdivisiones_json), fuente_url = VALUES(fuente_url),
             payload_json = VALUES(payload_json), sincronizado_at = NOW()`,
          [this.provider.name, holiday.externalKey, holiday.date, holiday.localName,
            holiday.internationalName, holiday.sourceType, holiday.global ? 1 : 0,
            JSON.stringify(holiday.subdivisions), holiday.sourceUrl, JSON.stringify(holiday.raw)],
        );
        if (result.affectedRows === 1) inserted += 1;
        else refreshed += 1;
      }
      await this.audit(connection, actorUserId, 'SINCRONIZADO', {
        provider: this.provider.name, year, received: holidays.length, inserted, refreshed,
      });
      return { provider: this.provider.name, year, received: holidays.length, inserted, refreshed };
    });
    return { summary, proposals: await this.list(year) };
  }

  async decide(id: number, input: HolidayDecisionInput, actorUserId: number) {
    const decision = normalizeHolidayDecision(input);
    await runInTransaction(async connection => {
      const [rows] = await connection.query<ProposalRow[]>(
        `${SELECT_PROPOSAL} WHERE proposal.id = ? LIMIT 1 FOR UPDATE`, [id],
      );
      if (!rows.length) throw new Error('La propuesta de feriado no existe.');
      const proposal = rows[0];
      if (proposal.estado !== 'PENDIENTE') {
        if (proposal.decision === decision.decision) return;
        throw new Error('Esta propuesta ya fue resuelta y no puede modificarse.');
      }

      let calendarEventId: number | null = null;
      if (decision.decision === 'JORNADA_ESPECIAL') {
        const schedule = await findEffectiveScheduleVersion(connection, Number(decision.scheduleId), dateOnly(proposal.fecha));
        if (!schedule) throw new Error('El horario elegido no tiene una versión vigente para esa fecha.');
      }

      if (decision.decision === 'NO_LABORABLE' || decision.decision === 'JORNADA_ESPECIAL') {
        const date = dateOnly(proposal.fecha);
        const [overlaps] = await connection.query<RowDataPacket[]>(
          `SELECT id, nombre FROM personal_calendario_laboral
            WHERE estado = 'ACTIVO' AND alcance = ?
              AND (alcance = 'EMPRESA' OR sede_id = ?)
              AND fecha_inicio <= ? AND fecha_fin >= ?
            LIMIT 1 FOR UPDATE`,
          [decision.scope, decision.siteId, date, date],
        );
        if (overlaps.length) {
          throw new Error(`Ya existe la regla laboral "${String(overlaps[0].nombre)}" para esa fecha y alcance.`);
        }
        const description = [
          'Propuesta externa revisada por administración.',
          decision.comment,
          `Fuente: ${proposal.fuente_url}`,
        ].filter(Boolean).join(' ');
        const [eventResult] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_calendario_laboral (
             alcance, sede_id, nombre, tipo, fecha_inicio, fecha_fin,
             horario_id, descripcion, creado_por
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [decision.scope, decision.siteId, proposal.nombre_local,
            decision.decision === 'NO_LABORABLE' ? 'FERIADO' : 'JORNADA_ESPECIAL',
            date, date, decision.scheduleId, description, actorUserId],
        );
        calendarEventId = eventResult.insertId;
      }

      const state: ProposalState = decision.decision === 'DESCARTAR' ? 'DESCARTADA' : 'APROBADA';
      await connection.query(
        `UPDATE personal_calendario_propuestas
            SET estado = ?, decision = ?, evento_calendario_id = ?,
                comentario_decision = ?, decidido_por = ?, decidido_at = NOW()
          WHERE id = ?`,
        [state, decision.decision, calendarEventId, decision.comment, actorUserId, id],
      );
      await this.audit(connection, actorUserId, 'RESUELTO', {
        proposal_id: id, decision: decision.decision, scope: decision.scope,
        site_id: decision.siteId, schedule_id: decision.scheduleId,
        calendar_event_id: calendarEventId,
      });
    });
    return this.getById(id);
  }

  private async getById(id: number): Promise<HolidayProposal> {
    const [rows] = await pool.query<ProposalRow[]>(`${SELECT_PROPOSAL} WHERE proposal.id = ? LIMIT 1`, [id]);
    if (!rows.length) throw new Error('La propuesta de feriado no existe.');
    return publicProposal(rows[0]);
  }

  private async audit(
    connection: PoolConnection,
    actorUserId: number,
    result: string,
    metadata: unknown,
  ) {
    await connection.query(
      `INSERT INTO personal_auditoria_eventos (
         tipo_evento, usuario_id, exitoso, codigo_resultado, metadata_json
       ) VALUES ('CALENDARIO_FERIADOS_API', ?, 1, ?, ?)`,
      [actorUserId, result, JSON.stringify(metadata)],
    );
  }
}
