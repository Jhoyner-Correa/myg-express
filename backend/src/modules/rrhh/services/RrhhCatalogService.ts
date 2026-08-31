import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool, runInTransaction } from '../../../core/database/database';

const TRACKING_TYPES = ['NINGUNO', 'SOLO_MARCACION', 'CONTINUO'] as const;

type TrackingType = (typeof TRACKING_TYPES)[number];

export interface JobRoleInput {
  name: string;
  description?: string | null;
  defaultTrackingType?: TrackingType;
}

function requiredName(value: unknown, label: string): string {
  const name = String(value || '').trim();
  if (name.length < 2 || name.length > 100) {
    throw new Error(`${label} debe tener entre 2 y 100 caracteres.`);
  }
  return name;
}

export class RrhhCatalogService {
  async listSites(scopedSiteId: number | null, companyId: number | null = null) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, nombre, estado
         FROM sedes
        WHERE estado = 'activo'
          AND (? IS NULL OR empresa_id = ?)
          AND (? IS NULL OR id = ?)
        ORDER BY nombre ASC`,
      [companyId, companyId, scopedSiteId, scopedSiteId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.nombre),
      code: null,
      status: String(row.estado),
    }));
  }

  async listJobRoles() {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, nombre, descripcion, tipo_rastreo_defecto, created_at, updated_at
         FROM personal_cargos ORDER BY nombre ASC`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.nombre),
      description: row.descripcion ? String(row.descripcion) : null,
      default_tracking_type: String(row.tipo_rastreo_defecto),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async saveJobRole(id: number | null, input: JobRoleInput, actorUserId: number) {
    const name = requiredName(input.name, 'El nombre del cargo');
    const description = String(input.description || '').trim().slice(0, 255) || null;
    const trackingType = input.defaultTrackingType || 'SOLO_MARCACION';
    if (!TRACKING_TYPES.includes(trackingType)) {
      throw new Error('El tipo de rastreo del cargo no es válido.');
    }
    const resultId = await runInTransaction(async (connection) => {
      let roleId = id;
      if (roleId === null) {
        const [result] = await connection.query<ResultSetHeader>(
          `INSERT INTO personal_cargos (nombre, descripcion, tipo_rastreo_defecto)
           VALUES (?, ?, ?)`,
          [name, description, trackingType],
        );
        roleId = result.insertId;
      } else {
        const [result] = await connection.query<ResultSetHeader>(
          `UPDATE personal_cargos
              SET nombre = ?, descripcion = ?, tipo_rastreo_defecto = ?
            WHERE id = ?`,
          [name, description, trackingType, roleId],
        );
        if (!result.affectedRows) throw new Error('Cargo no encontrado.');
      }
      await connection.query(
        `INSERT INTO personal_auditoria_eventos (
          tipo_evento, usuario_id, exitoso, codigo_resultado, metadata_json
        ) VALUES ('CONFIGURACION_CARGO', ?, 1, ?, ?)`,
        [actorUserId, id === null ? 'CREADO' : 'ACTUALIZADO', JSON.stringify({ role_id: roleId })],
      );
      return roleId;
    });
    return (await this.listJobRoles()).find((role) => role.id === resultId);
  }

}
