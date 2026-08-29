import { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../../core/database/database';

export type MobileNotificationPriority = 'INFO' | 'IMPORTANTE' | 'URGENTE';
export type MobileNotificationAction = 'INICIO' | 'HISTORIAL' | 'PERFIL';

export type CreateEmployeeNotificationInput = {
  employeeId: number;
  type: string;
  title: string;
  message: string;
  priority?: MobileNotificationPriority;
  action?: MobileNotificationAction;
  referenceType?: string | null;
  referenceId?: number | null;
  deduplicationKey?: string | null;
  expiresAt?: Date | null;
};

export async function createEmployeeNotification(
  connection: PoolConnection,
  input: CreateEmployeeNotificationInput,
): Promise<void> {
  await connection.query(
    `INSERT INTO personal_notificaciones_app (
       empleado_id, tipo, titulo, mensaje, prioridad, accion,
       referencia_tipo, referencia_id, clave_deduplicacion, expira_en
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE titulo = VALUES(titulo), mensaje = VALUES(mensaje),
       prioridad = VALUES(prioridad), accion = VALUES(accion), expira_en = VALUES(expira_en),
       updated_at = CURRENT_TIMESTAMP`,
    [input.employeeId, input.type.slice(0, 50), input.title.slice(0, 160),
      input.message.slice(0, 500), input.priority ?? 'INFO', input.action ?? 'INICIO',
      input.referenceType?.slice(0, 50) ?? null, input.referenceId ?? null,
      input.deduplicationKey?.slice(0, 190) ?? null, input.expiresAt ?? null],
  );
}

type NotificationRow = RowDataPacket & {
  id: number; tipo: string; titulo: string; mensaje: string;
  prioridad: MobileNotificationPriority; accion: MobileNotificationAction;
  referencia_tipo: string | null; referencia_id: number | null;
  leida_en: Date | null; created_at: Date;
};

export class MobileNotificationService {
  async list(employeeId: number, requestedLimit: unknown) {
    const parsedLimit = Number(requestedLimit ?? 30);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 30;
    const [rows] = await pool.query<NotificationRow[]>(
      `SELECT id, tipo, titulo, mensaje, prioridad, accion, referencia_tipo,
              referencia_id, leida_en, created_at
         FROM personal_notificaciones_app
        WHERE empleado_id = ? AND (expira_en IS NULL OR expira_en > NOW())
        ORDER BY (leida_en IS NULL) DESC, created_at DESC, id DESC LIMIT ?`,
      [employeeId, limit],
    );
    const [[counter]] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS unread_count FROM personal_notificaciones_app
        WHERE empleado_id = ? AND leida_en IS NULL
          AND (expira_en IS NULL OR expira_en > NOW())`,
      [employeeId],
    );
    return {
      items: rows.map(row => ({
        id: Number(row.id), type: row.tipo, title: row.titulo, message: row.mensaje,
        priority: row.prioridad, action: row.accion, reference_type: row.referencia_tipo,
        reference_id: row.referencia_id === null ? null : Number(row.referencia_id),
        read_at: row.leida_en, created_at: row.created_at,
      })),
      unread_count: Number(counter?.unread_count ?? 0),
    };
  }

  async markRead(employeeId: number, notificationId: number) {
    if (!Number.isInteger(notificationId) || notificationId < 1) throw new Error('Notificacion no valida.');
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE personal_notificaciones_app SET leida_en = COALESCE(leida_en, NOW())
        WHERE id = ? AND empleado_id = ?`,
      [notificationId, employeeId],
    );
    if (result.affectedRows !== 1) throw new Error('Notificacion no encontrada.');
  }

  async markAllRead(employeeId: number) {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE personal_notificaciones_app SET leida_en = NOW()
        WHERE empleado_id = ? AND leida_en IS NULL
          AND (expira_en IS NULL OR expira_en > NOW())`,
      [employeeId],
    );
    return result.affectedRows;
  }
}
