import crypto from 'crypto';
import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { pool, runInTransaction } from '../../core/database/database';
import { buildPackageLabelsTspl, PrintJobInput, PrintingValidationError } from './printingDomain';

export type UserScope = {
  userId: number;
  userName: string;
  companyId: number | null;
  siteId: number | null;
};

export type PrintAgent = {
  id: number;
  siteId: number;
  name: string;
  printerName: string | null;
};

type AgentRow = RowDataPacket & {
  id: number;
  sede_id: number;
  nombre: string;
  equipo_nombre: string | null;
  impresora_nombre: string | null;
  impresoras_json: string | null;
  version_conector: string | null;
  estado: 'ACTIVO' | 'INACTIVO';
  ultimo_contacto_at: Date | string | null;
  vinculado_at: Date | string | null;
};

type JobRow = RowDataPacket & {
  id: number;
  sede_id: number;
  sede_nombre: string;
  solicitado_por_nombre: string;
  estado: 'PENDIENTE' | 'PROCESANDO' | 'ENVIADO' | 'ERROR' | 'CANCELADO';
  referencia: string;
  origen_json: string;
  payload_tspl: string;
  numero_comandas: number;
  numero_etiquetas: number;
  copias: number;
  intentos: number;
  error_detalle: string | null;
  agente_nombre: string | null;
  impresora_nombre: string | null;
  created_at: Date | string;
  enviado_at: Date | string | null;
};

function mapJob(row: JobRow, includePayload = false) {
  let labels: unknown[] = [];
  let dispatchDay = '';
  try {
    const parsed = JSON.parse(String(row.origen_json));
    labels = Array.isArray(parsed?.labels) ? parsed.labels : [];
    dispatchDay = String(parsed?.dispatchDay ?? '');
  } catch {
    labels = [];
  }
  return {
    id: Number(row.id),
    siteId: Number(row.sede_id),
    siteName: row.sede_nombre,
    requestedBy: row.solicitado_por_nombre,
    status: row.estado,
    reference: row.referencia,
    labels,
    dispatchDay,
    packageCount: Number(row.numero_comandas),
    labelCount: Number(row.numero_etiquetas),
    copies: Number(row.copias),
    attempts: Number(row.intentos),
    error: row.error_detalle,
    agentName: row.agente_nombre,
    printerName: row.impresora_nombre,
    createdAt: row.created_at,
    sentAt: row.enviado_at,
    ...(includePayload ? { payload: row.payload_tspl } : {}),
  };
}

function cleanText(value: unknown, maximum: number, label: string): string {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new PrintingValidationError(`${label} es obligatorio.`);
  if (text.length > maximum) throw new PrintingValidationError(`${label} admite hasta ${maximum} caracteres.`);
  return text;
}

function normalizePrinters(value: unknown): string[] {
  if (!Array.isArray(value)) throw new PrintingValidationError('La lista de impresoras no es valida.');
  return [...new Set(value
    .map(item => String(item ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim())
    .filter(item => item.length > 0 && item.length <= 180))]
    .slice(0, 50);
}

function parsePrinters(value: unknown): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function suggestPhysicalPrinter(printers: string[]): string | null {
  const known = printers.find(name => /luxur|pos[- _]?l|label|thermal|xprinter|gprinter|tsc/i.test(name));
  if (known) return known;
  const physical = printers.filter(name => !/pdf|xps|fax|onenote|anydesk/i.test(name));
  return physical.length === 1 ? physical[0] : null;
}

function mapAgent(row: AgentRow) {
  const lastSeen = row.ultimo_contacto_at ? new Date(row.ultimo_contacto_at) : null;
  return {
    id: Number(row.id),
    siteId: Number(row.sede_id),
    name: row.nombre,
    computerName: row.equipo_nombre,
    printerName: row.impresora_nombre,
    printers: parsePrinters(row.impresoras_json),
    connectorVersion: row.version_conector,
    status: row.estado,
    online: Boolean(lastSeen && !Number.isNaN(lastSeen.getTime()) && Date.now() - lastSeen.getTime() <= 90_000),
    lastSeenAt: row.ultimo_contacto_at,
    pairedAt: row.vinculado_at,
  };
}

async function assertAccessibleSite(connection: PoolConnection, scope: UserScope, siteId: number) {
  if (scope.siteId && scope.siteId !== siteId) {
    throw new PrintingValidationError('No tienes acceso a la sede seleccionada.', 403);
  }
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT id, nombre FROM sedes
      WHERE id = ? AND estado = 'activo'
        AND (? IS NULL OR empresa_id = ?)
      LIMIT 1`,
    [siteId, scope.companyId, scope.companyId],
  );
  if (!rows.length) throw new PrintingValidationError('La sede seleccionada no esta disponible.', 404);
  return rows[0];
}

async function audit(
  connection: PoolConnection,
  scope: UserScope,
  event: string,
  jobId: number,
  siteId: number,
  metadata: Record<string, unknown>,
) {
  await connection.query(
    `INSERT INTO auditoria_sistema
      (actor_usuario_id, evento, entidad_tipo, entidad_id, empresa_id, sede_id, metadata)
     VALUES (?, ?, 'IMPRESION', ?, ?, ?, ?)`,
    [scope.userId, event, String(jobId), scope.companyId, siteId, JSON.stringify(metadata)],
  );
}

const JOB_SELECT = `SELECT job.*, site.nombre AS sede_nombre,
  agent.nombre AS agente_nombre, agent.impresora_nombre
  FROM impresion_trabajos job
  INNER JOIN sedes site ON site.id = job.sede_id
  LEFT JOIN impresion_agentes agent ON agent.id = job.agente_id`;

export class PrintingService {
  async listAgents(scope: UserScope, siteId: number) {
    const connection = await pool.getConnection();
    try {
      await assertAccessibleSite(connection, scope, siteId);
      const [rows] = await connection.query<AgentRow[]>(
        `SELECT * FROM impresion_agentes WHERE sede_id = ? AND estado = 'ACTIVO' ORDER BY id DESC`,
        [siteId],
      );
      return rows.map(mapAgent);
    } finally {
      connection.release();
    }
  }

  async createPairing(scope: UserScope, siteId: number) {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const code = Array.from({ length: 8 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join('');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    return runInTransaction(async connection => {
      await assertAccessibleSite(connection, scope, siteId);
      await connection.query(
        `UPDATE impresion_vinculaciones SET usado_at = NOW()
          WHERE sede_id = ? AND usado_at IS NULL`,
        [siteId],
      );
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO impresion_vinculaciones (sede_id, codigo_hash, creado_por, expira_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
        [siteId, codeHash, scope.userId],
      );
      await audit(connection, scope, 'IMPRESION_VINCULACION_CREADA', result.insertId, siteId, {});
      return { code: `${code.slice(0, 4)}-${code.slice(4)}`, expiresInSeconds: 600 };
    });
  }

  async pairAgent(rawCode: unknown, rawComputerName: unknown, rawPrinters: unknown, rawVersion: unknown) {
    const code = String(rawCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[2-9A-HJ-NP-Z]{8}$/.test(code)) throw new PrintingValidationError('El codigo de vinculacion no es valido.', 401);
    const computerName = cleanText(rawComputerName, 120, 'El nombre del equipo');
    const version = cleanText(rawVersion || '1.0.0', 32, 'La version del conector');
    const printers = normalizePrinters(rawPrinters);
    if (!printers.length) throw new PrintingValidationError('Windows no reporto impresoras instaladas.', 409);
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const suggestedPrinter = printers.find(name => /luxur/i.test(name)) ?? null;

    return runInTransaction(async connection => {
      const [pairings] = await connection.query<RowDataPacket[]>(
        `SELECT id, sede_id FROM impresion_vinculaciones
          WHERE codigo_hash = ? AND usado_at IS NULL AND expira_at >= NOW()
          LIMIT 1 FOR UPDATE`,
        [codeHash],
      );
      if (!pairings.length) throw new PrintingValidationError('El codigo vencio o ya fue utilizado.', 401);
      const siteId = Number(pairings[0].sede_id);
      const agentName = `Conector ${computerName}`.slice(0, 80);
      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO impresion_agentes
          (sede_id, nombre, equipo_nombre, token_hash, impresora_nombre, impresoras_json,
           version_conector, vinculado_at, ultimo_contacto_at, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), 'ACTIVO')
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id), equipo_nombre = VALUES(equipo_nombre), token_hash = VALUES(token_hash),
           impresora_nombre = VALUES(impresora_nombre), impresoras_json = VALUES(impresoras_json),
           version_conector = VALUES(version_conector), vinculado_at = NOW(),
           ultimo_contacto_at = NOW(), estado = 'ACTIVO'`,
        [siteId, agentName, computerName, tokenHash, suggestedPrinter, JSON.stringify(printers), version],
      );
      const agentId = Number(result.insertId);
      await connection.query(
        `UPDATE impresion_vinculaciones SET usado_at = NOW(), agente_id = ? WHERE id = ?`,
        [agentId, pairings[0].id],
      );
      return { token, agentId, siteId, printerName: suggestedPrinter };
    });
  }

  async selectAgentPrinter(scope: UserScope, agentId: number, rawPrinterName: unknown) {
    const printerName = cleanText(rawPrinterName, 180, 'La impresora');
    return runInTransaction(async connection => {
      const [rows] = await connection.query<AgentRow[]>(
        `SELECT * FROM impresion_agentes WHERE id = ? AND estado = 'ACTIVO' LIMIT 1 FOR UPDATE`,
        [agentId],
      );
      if (!rows.length) throw new PrintingValidationError('El conector no existe.', 404);
      await assertAccessibleSite(connection, scope, Number(rows[0].sede_id));
      if (!parsePrinters(rows[0].impresoras_json).includes(printerName)) {
        throw new PrintingValidationError('La impresora seleccionada no fue detectada por ese equipo.', 409);
      }
      await connection.query('UPDATE impresion_agentes SET impresora_nombre = ? WHERE id = ?', [printerName, agentId]);
      await audit(connection, scope, 'IMPRESION_IMPRESORA_SELECCIONADA', agentId, Number(rows[0].sede_id), { printerName });
      return { printerName };
    });
  }

  async removeAgent(scope: UserScope, agentId: number) {
    return runInTransaction(async connection => {
      const [rows] = await connection.query<AgentRow[]>(
        `SELECT * FROM impresion_agentes WHERE id = ? AND estado = 'ACTIVO' LIMIT 1 FOR UPDATE`,
        [agentId],
      );
      if (!rows.length) throw new PrintingValidationError('El conector no existe.', 404);
      await assertAccessibleSite(connection, scope, Number(rows[0].sede_id));
      await connection.query(
        `UPDATE impresion_agentes SET estado = 'INACTIVO', token_hash = SHA2(CONCAT(token_hash, UUID()), 256), ultimo_contacto_at = NULL WHERE id = ?`,
        [agentId],
      );
      await audit(connection, scope, 'IMPRESION_CONECTOR_DESVINCULADO', agentId, Number(rows[0].sede_id), {});
    });
  }
  async listSites(scope: UserScope) {
    const params: unknown[] = [scope.companyId, scope.companyId];
    const siteRestriction = scope.siteId ? 'AND site.id = ?' : '';
    if (scope.siteId) params.push(scope.siteId);
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT site.id, site.nombre,
          COUNT(agent.id) AS agent_count,
          MAX(agent.ultimo_contacto_at) AS last_seen_at,
          GROUP_CONCAT(DISTINCT agent.impresora_nombre ORDER BY agent.nombre SEPARATOR ', ') AS printers
       FROM sedes site
       LEFT JOIN impresion_agentes agent
         ON agent.sede_id = site.id AND agent.estado = 'ACTIVO'
       WHERE site.estado = 'activo'
         AND (? IS NULL OR site.empresa_id = ?)
         ${siteRestriction}
       GROUP BY site.id, site.nombre
       ORDER BY site.nombre ASC`,
      params,
    );
    const now = Date.now();
    return rows.map(row => {
      const lastSeen = row.last_seen_at ? new Date(row.last_seen_at) : null;
      const online = Boolean(lastSeen && !Number.isNaN(lastSeen.getTime()) && now - lastSeen.getTime() <= 90_000);
      return {
        id: Number(row.id),
        name: String(row.nombre),
        agentConfigured: Number(row.agent_count) > 0,
        agentOnline: online,
        lastSeenAt: lastSeen,
        printers: row.printers ? String(row.printers).split(', ') : [],
      };
    });
  }

  async listJobs(scope: UserScope, siteId: number, limit = 50) {
    const connection = await pool.getConnection();
    try {
      await assertAccessibleSite(connection, scope, siteId);
      const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
      const [rows] = await connection.query<JobRow[]>(
        `${JOB_SELECT}
          WHERE job.sede_id = ?
          ORDER BY job.id DESC
          LIMIT ?`,
        [siteId, safeLimit],
      );
      return rows.map(row => mapJob(row));
    } finally {
      connection.release();
    }
  }

  async createJob(scope: UserScope, input: PrintJobInput) {
    const rendered = await buildPackageLabelsTspl(input.labels, input.dispatchDay, input.copies, input.design);
    return runInTransaction(async connection => {
      await assertAccessibleSite(connection, scope, input.siteId);
      const [existing] = await connection.query<JobRow[]>(
        `${JOB_SELECT} WHERE job.creado_por = ? AND job.idempotency_key = ? LIMIT 1`,
        [scope.userId, input.idempotencyKey],
      );
      if (existing.length) return mapJob(existing[0]);

      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO impresion_trabajos
          (sede_id, creado_por, solicitado_por_nombre, referencia, origen_json, payload_tspl,
           numero_comandas, numero_etiquetas, copias, idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
        [
          input.siteId,
          scope.userId,
          scope.userName.slice(0, 120),
          input.reference,
          JSON.stringify({ labels: input.labels, dispatchDay: input.dispatchDay, design: input.design }),
          rendered.payload,
          input.labels.length,
          rendered.labelCount,
          input.copies,
          input.idempotencyKey,
        ],
      );
      if (result.affectedRows === 1) {
        await audit(connection, scope, 'IMPRESION_TRABAJO_CREADO', result.insertId, input.siteId, {
          reference: input.reference,
          packages: input.labels.length,
          dispatchDay: input.dispatchDay,
          labels: rendered.labelCount,
          copies: input.copies,
        });
      }
      const [created] = await connection.query<JobRow[]>(
        `${JOB_SELECT} WHERE job.id = ? LIMIT 1`,
        [result.insertId],
      );
      return mapJob(created[0]);
    });
  }

  async cancelJob(scope: UserScope, jobId: number) {
    return runInTransaction(async connection => {
      const [rows] = await connection.query<JobRow[]>(
        `${JOB_SELECT} WHERE job.id = ? LIMIT 1 FOR UPDATE`,
        [jobId],
      );
      if (!rows.length) throw new PrintingValidationError('El trabajo de impresion no existe.', 404);
      await assertAccessibleSite(connection, scope, Number(rows[0].sede_id));
      if (rows[0].estado !== 'PENDIENTE') {
        throw new PrintingValidationError('Solo se puede cancelar un trabajo pendiente.', 409);
      }
      await connection.query(
        `UPDATE impresion_trabajos SET estado = 'CANCELADO', error_detalle = NULL WHERE id = ?`,
        [jobId],
      );
      await audit(connection, scope, 'IMPRESION_TRABAJO_CANCELADO', jobId, Number(rows[0].sede_id), {});
    });
  }

  async retryJob(scope: UserScope, jobId: number) {
    return runInTransaction(async connection => {
      const [rows] = await connection.query<JobRow[]>(
        `${JOB_SELECT} WHERE job.id = ? LIMIT 1 FOR UPDATE`,
        [jobId],
      );
      if (!rows.length) throw new PrintingValidationError('El trabajo de impresion no existe.', 404);
      await assertAccessibleSite(connection, scope, Number(rows[0].sede_id));
      if (rows[0].estado !== 'ERROR') {
        throw new PrintingValidationError('Solo se puede reintentar un trabajo con error.', 409);
      }
      await connection.query(
        `UPDATE impresion_trabajos
            SET estado = 'PENDIENTE', agente_id = NULL, reservado_at = NULL, error_detalle = NULL
          WHERE id = ?`,
        [jobId],
      );
      await audit(connection, scope, 'IMPRESION_TRABAJO_REINTENTADO', jobId, Number(rows[0].sede_id), {});
    });
  }

  async authenticateAgent(rawToken: unknown): Promise<PrintAgent> {
    const token = String(rawToken ?? '').trim();
    if (Buffer.byteLength(token, 'utf8') < 32) throw new PrintingValidationError('Agente no autorizado.', 401);
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, sede_id, nombre, impresora_nombre
         FROM impresion_agentes
        WHERE token_hash = ? AND estado = 'ACTIVO'
        LIMIT 1`,
      [hash],
    );
    if (!rows.length) throw new PrintingValidationError('Agente no autorizado.', 401);
    return {
      id: Number(rows[0].id),
      siteId: Number(rows[0].sede_id),
      name: String(rows[0].nombre),
      printerName: rows[0].impresora_nombre == null ? null : String(rows[0].impresora_nombre),
    };
  }

  async heartbeat(agent: PrintAgent, rawPrinters?: unknown, rawVersion?: unknown) {
    const printers = rawPrinters === undefined ? null : normalizePrinters(rawPrinters);
    const version = rawVersion === undefined ? null : cleanText(rawVersion, 32, 'La version del conector');
    const suggestedPrinter = printers ? suggestPhysicalPrinter(printers) : null;
    await pool.query(
      `UPDATE impresion_agentes
          SET ultimo_contacto_at = NOW(),
              impresoras_json = COALESCE(?, impresoras_json),
              version_conector = COALESCE(?, version_conector),
              impresora_nombre = COALESCE(impresora_nombre, ?)
        WHERE id = ?`,
      [printers ? JSON.stringify(printers) : null, version, suggestedPrinter, agent.id],
    );
    const [rows] = await pool.query<AgentRow[]>('SELECT * FROM impresion_agentes WHERE id = ? LIMIT 1', [agent.id]);
    return { serverTime: new Date(), agent: mapAgent(rows[0]) };
  }

  async claimNextJob(agent: PrintAgent) {
    if (!agent.printerName) throw new PrintingValidationError('Selecciona una impresora desde el sistema web.', 409);
    return runInTransaction(async connection => {
      await connection.query(
        `UPDATE impresion_agentes SET ultimo_contacto_at = NOW() WHERE id = ?`,
        [agent.id],
      );
      await connection.query(
        `UPDATE impresion_trabajos
            SET estado = 'ERROR', error_detalle = 'El agente no confirmo el envio. Revisa la impresora antes de reintentar.'
          WHERE sede_id = ? AND estado = 'PROCESANDO'
            AND reservado_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
        [agent.siteId],
      );
      const [rows] = await connection.query<JobRow[]>(
        `${JOB_SELECT}
          WHERE job.sede_id = ? AND job.estado = 'PENDIENTE'
          ORDER BY job.id ASC
          LIMIT 1 FOR UPDATE`,
        [agent.siteId],
      );
      if (!rows.length) return null;
      await connection.query(
        `UPDATE impresion_trabajos
            SET estado = 'PROCESANDO', agente_id = ?, reservado_at = NOW(),
                intentos = intentos + 1, error_detalle = NULL
          WHERE id = ?`,
        [agent.id, rows[0].id],
      );
      return mapJob({
        ...rows[0],
        agente_nombre: agent.name,
        impresora_nombre: agent.printerName,
        intentos: Number(rows[0].intentos) + 1,
      }, true);
    });
  }

  async completeJob(agent: PrintAgent, jobId: number, success: boolean, errorMessage?: string) {
    return runInTransaction(async connection => {
      const [rows] = await connection.query<JobRow[]>(
        `${JOB_SELECT}
          WHERE job.id = ? AND job.sede_id = ? AND job.agente_id = ?
          LIMIT 1 FOR UPDATE`,
        [jobId, agent.siteId, agent.id],
      );
      if (!rows.length || rows[0].estado !== 'PROCESANDO') {
        throw new PrintingValidationError('El trabajo ya no esta reservado por este agente.', 409);
      }
      if (success) {
        await connection.query(
          `UPDATE impresion_trabajos
              SET estado = 'ENVIADO', enviado_at = NOW(), error_detalle = NULL
            WHERE id = ?`,
          [jobId],
        );
      } else {
        const detail = String(errorMessage ?? 'La impresora rechazo el trabajo.').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 500);
        await connection.query(
          `UPDATE impresion_trabajos SET estado = 'ERROR', error_detalle = ? WHERE id = ?`,
          [detail || 'La impresora rechazo el trabajo.', jobId],
        );
      }
      await connection.query('UPDATE impresion_agentes SET ultimo_contacto_at = NOW() WHERE id = ?', [agent.id]);
    });
  }
}

export const printingService = new PrintingService();
