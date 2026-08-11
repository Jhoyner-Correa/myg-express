// ============================================================
// backend/src/modules/auth/repositories/mysql/MySqlUsuarioRepository.ts
// Implementación en MySQL/MariaDB del repositorio de usuarios
// ============================================================

import { pool } from '../../../../core/database/database';
import { Usuario, UserRole, UserStatus } from '../../domain/Usuario';
import { IUsuarioRepository } from '../IUsuarioRepository';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export class MySqlUsuarioRepository implements IUsuarioRepository {
  
  private mapRowToEntity(row: any): Usuario {
    let parsedPermisos: string[] | null = null;
    if (row.permisos) {
      try {
        parsedPermisos = typeof row.permisos === 'string' ? JSON.parse(row.permisos) : row.permisos;
      } catch (e) {
        console.error('Error al parsear permisos de la base de datos:', e);
      }
    }

    return {
      id: row.id,
      sedeId: row.sede_id,
      nombre: row.nombre,
      usuario: row.usuario,
      passwordHash: row.password_hash,
      rol: row.rol as UserRole,
      esSuperadmin: Boolean(row.es_superadmin),
      estado: row.estado as UserStatus,
      permisos: parsedPermisos,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  async buscarPorUsuario(username: string): Promise<Usuario | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, sede_id, nombre, usuario, password_hash, rol, es_superadmin, estado, permisos, created_at, updated_at
       FROM usuarios
       WHERE usuario = ?
       LIMIT 1`,
      [username]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async buscarPorId(id: number): Promise<Usuario | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, sede_id, nombre, usuario, password_hash, rol, es_superadmin, estado, permisos, created_at, updated_at
       FROM usuarios
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async actualizarPerfil(
    id: number,
    nombre: string,
    usuario: string,
    passwordHash?: string
  ): Promise<boolean> {
    let sql = `UPDATE usuarios SET nombre = ?, usuario = ?`;
    const params: any[] = [nombre, usuario];

    if (passwordHash) {
      sql += `, password_hash = ?`;
      params.push(passwordHash);
    }

    sql += ` WHERE id = ?`;
    params.push(id);

    const [result] = await pool.query<ResultSetHeader>(sql, params);
    return result.affectedRows > 0;
  }

  async crear(u: Omit<Usuario, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO usuarios (sede_id, nombre, usuario, password_hash, rol, es_superadmin, estado, permisos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        u.sedeId,
        u.nombre,
        u.usuario,
        u.passwordHash,
        u.rol,
        u.esSuperadmin ? 1 : 0,
        u.estado,
        u.permisos ? JSON.stringify(u.permisos) : null
      ]
    );

    return result.insertId;
  }

  async actualizar(id: number, datos: Partial<Omit<Usuario, 'id' | 'createdAt' | 'updatedAt'>>): Promise<boolean> {
    const fields: string[] = [];
    const params: any[] = [];

    if (datos.sedeId !== undefined) {
      fields.push('sede_id = ?');
      params.push(datos.sedeId);
    }
    if (datos.nombre !== undefined) {
      fields.push('nombre = ?');
      params.push(datos.nombre);
    }
    if (datos.usuario !== undefined) {
      fields.push('usuario = ?');
      params.push(datos.usuario);
    }
    if (datos.passwordHash !== undefined) {
      fields.push('password_hash = ?');
      params.push(datos.passwordHash);
    }
    if (datos.rol !== undefined) {
      fields.push('rol = ?');
      params.push(datos.rol);
    }
    if (datos.esSuperadmin !== undefined) {
      fields.push('es_superadmin = ?');
      params.push(datos.esSuperadmin ? 1 : 0);
    }
    if (datos.estado !== undefined) {
      fields.push('estado = ?');
      params.push(datos.estado);
    }
    if (datos.permisos !== undefined) {
      fields.push('permisos = ?');
      params.push(datos.permisos ? JSON.stringify(datos.permisos) : null);
    }

    if (fields.length === 0) return false;

    params.push(id);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    return result.affectedRows > 0;
  }

  async listarTodos(): Promise<(Usuario & { sedeNombre: string | null })[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.id, u.sede_id, u.nombre, u.usuario, u.password_hash, u.rol, u.es_superadmin, u.estado, u.permisos, u.created_at, u.updated_at,
              s.nombre AS sede_nombre
       FROM usuarios u
       LEFT JOIN sedes s ON u.sede_id = s.id
       ORDER BY u.created_at DESC`
    );

    return rows.map(row => {
      const entity = this.mapRowToEntity(row);
      return {
        ...entity,
        sedeNombre: row.sede_nombre || null
      };
    });
  }

  async eliminar(id: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `DELETE FROM usuarios WHERE id = ?`,
      [id]
    );

    return result.affectedRows > 0;
  }
}
