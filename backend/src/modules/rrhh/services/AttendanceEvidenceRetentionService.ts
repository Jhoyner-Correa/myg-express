import { rm } from 'fs/promises';
import path from 'path';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';

export const PRIVATE_SELFIE_ROOT = path.resolve(
  process.env.RRHH_PRIVATE_EVIDENCE_DIR || path.join(process.cwd(), 'private-storage', 'rrhh-evidence'),
);

type EvidenceRow = RowDataPacket & {
  id: number;
  empleado_id: number;
  dispositivo_id: number;
  marcacion_id: number | null;
  selfie_storage_key: string;
  evidencia_estado: 'ACTIVA' | 'PENDIENTE_ELIMINACION' | 'ELIMINADA';
};

export type EvidenceCleanupResult = {
  expiredRequests: number;
  filesRemoved: number;
};

function evidencePath(storageKey: string): string {
  const safeKey = path.basename(storageKey);
  const absolutePath = path.resolve(PRIVATE_SELFIE_ROOT, safeKey);
  if (!absolutePath.startsWith(`${PRIVATE_SELFIE_ROOT}${path.sep}`)) {
    throw new Error('Ruta de evidencia no valida.');
  }
  return absolutePath;
}

async function removeEvidence(row: EvidenceRow, reason: string): Promise<boolean> {
  await rm(evidencePath(row.selfie_storage_key), { force: true });
  return runInTransaction(async connection => {
    const [updated] = await connection.query<ResultSetHeader>(
      `UPDATE personal_solicitudes_marcacion
          SET evidencia_estado = 'ELIMINADA', evidencia_eliminada_en = NOW()
        WHERE id = ? AND evidencia_estado <> 'ELIMINADA'`,
      [row.id],
    );
    if (updated.affectedRows !== 1) return false;
    if (row.marcacion_id !== null) {
      await connection.query(
        `UPDATE personal_marcaciones
            SET selfie_path = NULL
          WHERE id = ?`,
        [row.marcacion_id],
      );
      await connection.query(
        `UPDATE personal_evidencias_marcacion
            SET estado = 'ELIMINADA', eliminada_en = NOW()
          WHERE marcacion_id = ? AND estado <> 'RETENIDA'`,
        [row.marcacion_id],
      );
    }
    await connection.query(
      `INSERT INTO personal_auditoria_eventos (
        tipo_evento, empleado_id, dispositivo_id, exitoso, codigo_resultado, metadata_json
      ) VALUES ('ELIMINACION_EVIDENCIA_SELFIE', ?, ?, 1, 'ELIMINADA', ?)`,
      [row.empleado_id, row.dispositivo_id, JSON.stringify({ solicitud_id: row.id, motivo: reason })],
    );
    return true;
  });
}

async function requestEvidence(requestId: number): Promise<EvidenceRow | null> {
  const [rows] = await pool.query<EvidenceRow[]>(
    `SELECT id, empleado_id, dispositivo_id, marcacion_id, selfie_storage_key, evidencia_estado
       FROM personal_solicitudes_marcacion WHERE id = ? LIMIT 1`,
    [requestId],
  );
  return rows[0] ?? null;
}

export async function deleteAttendanceEvidenceNow(requestId: number, reason: string): Promise<boolean> {
  await pool.query(
    `UPDATE personal_solicitudes_marcacion
        SET evidencia_estado = 'PENDIENTE_ELIMINACION', expira_en = NOW()
      WHERE id = ? AND evidencia_estado = 'ACTIVA'`,
    [requestId],
  );
  const row = await requestEvidence(requestId);
  if (!row || row.evidencia_estado === 'ELIMINADA') return false;
  return removeEvidence(row, reason);
}

export async function cleanupExpiredAttendanceEvidence(limit = 200): Promise<EvidenceCleanupResult> {
  const [expired] = await pool.query<ResultSetHeader>(
    `UPDATE personal_solicitudes_marcacion
        SET estado = 'CANCELADA',
            comentario_revision = COALESCE(comentario_revision, 'Solicitud vencida por politica de retencion.'),
            revisado_en = COALESCE(revisado_en, NOW()),
            evidencia_estado = 'PENDIENTE_ELIMINACION'
      WHERE estado = 'PENDIENTE' AND expira_en <= NOW()`,
  );
  await pool.query(
    `UPDATE personal_solicitudes_marcacion
        SET evidencia_estado = 'PENDIENTE_ELIMINACION'
      WHERE evidencia_estado = 'ACTIVA'
        AND (estado = 'APROBADA' OR (estado IN ('RECHAZADA', 'CANCELADA') AND expira_en <= NOW()))`,
  );
  const [rows] = await pool.query<EvidenceRow[]>(
    `SELECT id, empleado_id, dispositivo_id, marcacion_id, selfie_storage_key, evidencia_estado
       FROM personal_solicitudes_marcacion
      WHERE evidencia_estado = 'PENDIENTE_ELIMINACION'
      ORDER BY expira_en, id LIMIT ?`,
    [Math.max(1, Math.min(limit, 1000))],
  );
  let filesRemoved = 0;
  for (const row of rows) {
    try {
      if (await removeEvidence(row, row.marcacion_id ? 'APROBACION_COMPLETADA' : 'RETENCION_VENCIDA')) filesRemoved += 1;
    } catch (error) {
      console.error(`[rrhh-evidence] No se pudo eliminar evidencia ${row.id}:`, error);
    }
  }
  return { expiredRequests: Number(expired.affectedRows || 0), filesRemoved };
}
