import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../../../../core/database/database';
import { Usuario, UserAvatarVariant, UserStatus, UserType } from '../../domain/Usuario';
import { IUsuarioRepository } from '../IUsuarioRepository';

export class MySqlUsuarioRepository implements IUsuarioRepository {
  private mapRowToEntity(row: RowDataPacket): Usuario {
    return {
      id: Number(row.id),
      nombre: row.nombre,
      usuario: row.usuario,
      foto: row.foto ?? null,
      avatarVariant: row.avatar_variant as UserAvatarVariant,
      passwordHash: row.password_hash,
      tipoUsuario: row.tipo_usuario as UserType,
      estado: row.estado as UserStatus,
      ultimoAccesoAt: row.ultimo_acceso_at ? new Date(row.ultimo_acceso_at) : null,
      passwordActualizadoAt: row.password_actualizado_at ? new Date(row.password_actualizado_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  async buscarPorUsuario(username: string): Promise<Usuario | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, nombre, usuario, foto, avatar_variant, password_hash, tipo_usuario, estado,
              ultimo_acceso_at, password_actualizado_at, created_at, updated_at
         FROM usuarios WHERE usuario = ? LIMIT 1`,
      [username],
    );
    return rows.length ? this.mapRowToEntity(rows[0]) : null;
  }

  async buscarPorId(id: number): Promise<Usuario | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, nombre, usuario, foto, avatar_variant, password_hash, tipo_usuario, estado,
              ultimo_acceso_at, password_actualizado_at, created_at, updated_at
         FROM usuarios WHERE id = ? LIMIT 1`,
      [id],
    );
    return rows.length ? this.mapRowToEntity(rows[0]) : null;
  }

  async registrarUltimoAcceso(id: number): Promise<void> {
    await pool.query('UPDATE usuarios SET ultimo_acceso_at = NOW() WHERE id = ?', [id]);
  }

  async actualizarPerfil(
    id: number,
    nombre: string,
    usuario: string,
    passwordHash?: string,
  ): Promise<boolean> {
    const params: Array<string | number> = [nombre, usuario];
    let sql = 'UPDATE usuarios SET nombre = ?, usuario = ?';
    if (passwordHash) {
      sql += ', password_hash = ?, password_actualizado_at = NOW()';
      params.push(passwordHash);
    }
    sql += ' WHERE id = ?';
    params.push(id);
    const [result] = await pool.query<ResultSetHeader>(sql, params);
    return result.affectedRows > 0;
  }

  async actualizarFoto(id: number, foto: string | null): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>('UPDATE usuarios SET foto = ? WHERE id = ?', [foto, id]);
    return result.affectedRows > 0;
  }
}
