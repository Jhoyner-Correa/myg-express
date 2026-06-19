import bcrypt from 'bcrypt';
import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database';
import { encryptUrbanoPassword } from '../services/urbanoCredentialsService';
import {
  AppRole,
  getRoleLabel,
  isManagedUserRole,
  normalizeRole,
  roleRequiresSede,
  ROLES
} from '../constants/roles';
import { AuthRequest } from '../middlewares/authMiddleware';

type DashboardRow = RowDataPacket & {
  total_sedes: number;
  sedes_activas: number;
  total_usuarios: number;
  total_lotes: number;
  lotes_activos: number;
  total_destinatarios: number;
};

type SedeRow = RowDataPacket & {
  id: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  estado: 'activo' | 'inactivo';
  total_usuarios: number;
  total_sesiones: number;
  total_lotes: number;
  destinatarios: number;
};

type UsuarioRow = RowDataPacket & {
  id: number;
  sede_id: number | null;
  nombre: string;
  usuario: string;
  rol: string;
  es_superadmin: number;
  estado: 'activo' | 'inactivo';
  sede_nombre: string | null;
  created_at: string;
};

type UrbanoCredentialRow = RowDataPacket & {
  id: number;
  sede_id: number;
  sede_nombre: string;
  username: string;
  estado: 'activo' | 'inactivo';
  last_login_at: string | null;
  updated_at: string;
};

function validarTexto(value: unknown): string {
  return String(value || '').trim();
}

function obtenerRolGestionable(value: unknown): AppRole {
  const role = normalizeRole(value);
  return isManagedUserRole(role) ? role : ROLES.ENCARGADO_OFICINA;
}

async function assertSedeExiste(sedeId: number): Promise<boolean> {
  const [[sede]] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM sedes WHERE id = ? LIMIT 1',
    [sedeId]
  );
  return Boolean(sede);
}

function normalizarUsuarioParaRespuesta(user: UsuarioRow) {
  const rol = normalizeRole(user.rol, Boolean(user.es_superadmin));
  return {
    ...user,
    rol,
    rol_label: getRoleLabel(rol),
    sede_nombre: user.sede_nombre || 'Administracion Central'
  };
}

export async function obtenerResumenAdmin(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [[resumen]] = await pool.query<DashboardRow[]>(
      `SELECT
         (SELECT COUNT(*) FROM sedes) AS total_sedes,
         (SELECT COUNT(*) FROM sedes WHERE estado = 'activo') AS sedes_activas,
         (SELECT COUNT(*) FROM usuarios WHERE es_superadmin = 0) AS total_usuarios,
         (SELECT COUNT(*) FROM lotes_carga WHERE fecha_eliminacion IS NULL) AS total_lotes,
         (SELECT COUNT(*) FROM lotes_carga WHERE estado IN ('borrador', 'pendiente', 'procesando') AND fecha_eliminacion IS NULL) AS lotes_activos,
         (SELECT COUNT(*) FROM avisos_diarios) AS total_destinatarios`
    );

    const [sedes] = await pool.query<SedeRow[]>(
      `SELECT
         s.id,
         s.nombre,
         s.direccion,
         s.telefono,
         s.estado,
         COALESCE(u.cnt, 0) AS total_usuarios,
         COALESCE(ws.cnt, 0) AS total_sesiones,
         COALESCE(l.cnt, 0) AS total_lotes,
         COALESCE(a.cnt, 0) AS destinatarios
       FROM sedes s
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM usuarios WHERE es_superadmin = 0 GROUP BY sede_id) u ON u.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM whatsapp_sesiones GROUP BY sede_id) ws ON ws.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM lotes_carga WHERE fecha_eliminacion IS NULL GROUP BY sede_id) l ON l.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM avisos_diarios GROUP BY sede_id) a ON a.sede_id = s.id
       ORDER BY s.nombre ASC`
    );

    res.json({
      ok: true,
      data: {
        resumen,
        sedes
      }
    });
  } catch (error) {
    console.error('Error al obtener resumen admin:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudo cargar el resumen administrativo' });
  }
}

export async function listarSedesAdmin(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.query<SedeRow[]>(
      `SELECT
         s.id,
         s.nombre,
         s.direccion,
         s.telefono,
         s.estado,
         COALESCE(u.cnt, 0) AS total_usuarios,
         COALESCE(ws.cnt, 0) AS total_sesiones,
         COALESCE(l.cnt, 0) AS total_lotes,
         COALESCE(a.cnt, 0) AS destinatarios
       FROM sedes s
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM usuarios WHERE es_superadmin = 0 GROUP BY sede_id) u ON u.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM whatsapp_sesiones GROUP BY sede_id) ws ON ws.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM lotes_carga WHERE fecha_eliminacion IS NULL GROUP BY sede_id) l ON l.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM avisos_diarios GROUP BY sede_id) a ON a.sede_id = s.id
       ORDER BY s.nombre ASC`
    );

    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('Error al listar sedes:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar las sedes' });
  }
}

export async function crearSedeAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const nombre = validarTexto(req.body.nombre);
    const direccion = validarTexto(req.body.direccion);
    const telefono = validarTexto(req.body.telefono);

    if (!nombre) {
      res.status(400).json({ ok: false, mensaje: 'El nombre de la sede es obligatorio' });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO sedes (nombre, direccion, telefono, estado)
       VALUES (?, ?, ?, 'activo')`,
      [nombre, direccion || null, telefono || null]
    );

    res.status(201).json({
      ok: true,
      mensaje: 'Sede creada correctamente',
      id: result.insertId
    });
  } catch (error) {
    console.error('Error al crear sede:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudo crear la sede' });
  }
}

export async function actualizarSedeAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const nombre = validarTexto(req.body.nombre);
    const direccion = validarTexto(req.body.direccion);
    const telefono = validarTexto(req.body.telefono);
    const estado = validarTexto(req.body.estado) || 'activo';

    if (!nombre) {
      res.status(400).json({ ok: false, mensaje: 'El nombre de la sede es obligatorio' });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE sedes
       SET nombre = ?, direccion = ?, telefono = ?, estado = ?
       WHERE id = ?`,
      [nombre, direccion || null, telefono || null, estado, id]
    );

    if (!result.affectedRows) {
      res.status(404).json({ ok: false, mensaje: 'Sede no encontrada' });
      return;
    }

    res.json({ ok: true, mensaje: 'Sede actualizada correctamente' });
  } catch (error) {
    console.error('Error al actualizar sede:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudo actualizar la sede' });
  }
}

export async function eliminarSedeAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const [[uso]] = await pool.query<RowDataPacket[]>(
      `SELECT
         (SELECT COUNT(*) FROM usuarios WHERE sede_id = ?) AS usuarios,
         (SELECT COUNT(*) FROM lotes_carga WHERE sede_id = ? AND fecha_eliminacion IS NULL) AS lotes,
         (SELECT COUNT(*) FROM whatsapp_sesiones WHERE sede_id = ?) AS sesiones,
         (SELECT COUNT(*) FROM mensajes_log WHERE sede_id = ?) AS logs`,
      [id, id, id, id]
    );

    if (uso.usuarios > 0 || uso.lotes > 0 || uso.sesiones > 0 || uso.logs > 0) {
      res.status(400).json({
        ok: false,
        mensaje: 'No se puede eliminar la sede porque ya tiene usuarios, rutas, sesiones o logs asociados.'
      });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>('DELETE FROM sedes WHERE id = ?', [id]);

    if (!result.affectedRows) {
      res.status(404).json({ ok: false, mensaje: 'Sede no encontrada' });
      return;
    }

    res.json({ ok: true, mensaje: 'Sede eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar sede:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudo eliminar la sede' });
  }
}

export async function listarUsuariosAdmin(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.query<UsuarioRow[]>(
      `SELECT
         u.id,
         u.sede_id,
         u.nombre,
         u.usuario,
         u.rol,
         u.es_superadmin,
         u.estado,
         COALESCE(s.nombre, 'Administracion Central') AS sede_nombre,
         u.created_at
       FROM usuarios u
       LEFT JOIN sedes s ON s.id = u.sede_id
       WHERE u.es_superadmin = 0
       ORDER BY u.created_at DESC, u.id DESC`
    );

    res.json({ ok: true, data: rows.map(normalizarUsuarioParaRespuesta) });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar los usuarios' });
  }
}

export async function crearUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const rol = obtenerRolGestionable(req.body.rol);
    const sede_id = roleRequiresSede(rol) ? Number(req.body.sede_id) : null;
    const nombre = validarTexto(req.body.nombre);
    const usuario = validarTexto(req.body.usuario);
    const password = validarTexto(req.body.password);
    const estado = validarTexto(req.body.estado) || 'activo';
    const es_superadmin = 0;

    if (!nombre || !usuario || !password) {
      res.status(400).json({ ok: false, mensaje: 'Nombre, usuario y password son obligatorios' });
      return;
    }

    if (roleRequiresSede(rol)) {
      if (!sede_id) {
        res.status(400).json({ ok: false, mensaje: 'La sede es obligatoria para Encargado de Oficina' });
        return;
      }

      const sedeExiste = await assertSedeExiste(sede_id);
      if (!sedeExiste) {
        res.status(404).json({ ok: false, mensaje: 'La sede seleccionada no existe' });
        return;
      }
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO usuarios (sede_id, nombre, usuario, password_hash, rol, es_superadmin, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sede_id, nombre, usuario, hash, rol, es_superadmin, estado]
    );

    res.status(201).json({
      ok: true,
      mensaje: 'Usuario creado correctamente',
      id: result.insertId
    });
  } catch (error: any) {
    console.error('Error al crear usuario:', error);
    const mensaje = error?.code === 'ER_DUP_ENTRY'
      ? 'El nombre de usuario ya existe'
      : 'No se pudo crear el usuario';
    res.status(500).json({ ok: false, mensaje });
  }
}

export async function actualizarUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const nombre = validarTexto(req.body.nombre);
    const usuario = validarTexto(req.body.usuario);
    const password = validarTexto(req.body.password);
    const estado = validarTexto(req.body.estado) || 'activo';

    const [[existingUser]] = await pool.query<RowDataPacket[]>(
      'SELECT id, rol, es_superadmin FROM usuarios WHERE id = ? LIMIT 1',
      [id]
    );

    if (!existingUser) {
      res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
      return;
    }

    if (existingUser.es_superadmin) {
      res.status(400).json({
        ok: false,
        mensaje: 'Accion no permitida para este usuario'
      });
      return;
    }

    const es_superadmin = existingUser.es_superadmin ? 1 : 0;
    const rol = es_superadmin ? ROLES.SYSADMIN : obtenerRolGestionable(req.body.rol || existingUser.rol);
    const final_sede_id = roleRequiresSede(rol) ? Number(req.body.sede_id) : null;
    const final_estado = es_superadmin ? 'activo' : estado;

    if (!nombre || !usuario) {
      res.status(400).json({ ok: false, mensaje: 'Nombre y usuario son obligatorios' });
      return;
    }

    if (roleRequiresSede(rol)) {
      if (!final_sede_id) {
        res.status(400).json({ ok: false, mensaje: 'La sede es obligatoria para Encargado de Oficina' });
        return;
      }

      const sedeExiste = await assertSedeExiste(final_sede_id);
      if (!sedeExiste) {
        res.status(404).json({ ok: false, mensaje: 'La sede seleccionada no existe' });
        return;
      }
    }

    let sql = `UPDATE usuarios SET sede_id = ?, nombre = ?, usuario = ?, rol = ?, es_superadmin = ?, estado = ?`;
    const params: Array<string | number | null> = [final_sede_id, nombre, usuario, rol, es_superadmin, final_estado];

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sql += ', password_hash = ?';
      params.push(hash);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    const [result] = await pool.query<ResultSetHeader>(sql, params);

    if (!result.affectedRows) {
      res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
      return;
    }

    res.json({ ok: true, mensaje: 'Usuario actualizado correctamente' });
  } catch (error: any) {
    console.error('Error al actualizar usuario:', error);
    const mensaje = error?.code === 'ER_DUP_ENTRY'
      ? 'El nombre de usuario ya existe'
      : 'No se pudo actualizar el usuario';
    res.status(500).json({ ok: false, mensaje });
  }
}

export async function eliminarUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (String(req.user?.id) === String(id)) {
      res.status(400).json({ ok: false, mensaje: 'No puedes eliminar tu propio usuario administrador' });
      return;
    }

    const [[targetUser]] = await pool.query<RowDataPacket[]>(
      'SELECT es_superadmin FROM usuarios WHERE id = ? LIMIT 1',
      [id]
    );

    if (!targetUser) {
      res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
      return;
    }

    if (targetUser.es_superadmin) {
      res.status(400).json({ ok: false, mensaje: 'No se puede eliminar el SysAdmin del sistema' });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>('DELETE FROM usuarios WHERE id = ?', [id]);

    if (!result.affectedRows) {
      res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
      return;
    }

    res.json({ ok: true, mensaje: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudo eliminar el usuario' });
  }
}

export async function listarCredencialesUrbanoAdmin(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.query<UrbanoCredentialRow[]>(
      `SELECT
         c.id,
         c.sede_id,
         s.nombre AS sede_nombre,
         c.username,
         c.estado,
         c.last_login_at,
         c.updated_at
       FROM urbano_credenciales_sede c
       INNER JOIN sedes s ON s.id = c.sede_id
       ORDER BY s.nombre ASC`
    );

    res.json({ ok: true, data: rows });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.json({ ok: true, data: [] });
      return;
    }

    console.error('Error al listar credenciales Urbano:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar las credenciales Urbano' });
  }
}

export async function guardarCredencialUrbanoAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sedeId = Number(req.params.sedeId);
    const username = validarTexto(req.body.username);
    const password = String(req.body.password || '');
    const estado = validarTexto(req.body.estado) === 'inactivo' ? 'inactivo' : 'activo';

    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      res.status(400).json({ ok: false, mensaje: 'Sede invalida' });
      return;
    }

    if (!username) {
      res.status(400).json({ ok: false, mensaje: 'El usuario Urbano es obligatorio' });
      return;
    }

    const sedeExiste = await assertSedeExiste(sedeId);
    if (!sedeExiste) {
      res.status(404).json({ ok: false, mensaje: 'La sede seleccionada no existe' });
      return;
    }

    const [[existing]] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM urbano_credenciales_sede WHERE sede_id = ? LIMIT 1',
      [sedeId]
    );

    if (!existing && !password.trim()) {
      res.status(400).json({
        ok: false,
        mensaje: 'La contrasena Urbano es obligatoria al configurar una sede por primera vez'
      });
      return;
    }

    if (password.trim()) {
      const encrypted = encryptUrbanoPassword(password);
      await pool.query(
        `INSERT INTO urbano_credenciales_sede
           (sede_id, username, password_cipher, password_iv, password_auth_tag, estado)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           username = VALUES(username),
           password_cipher = VALUES(password_cipher),
           password_iv = VALUES(password_iv),
           password_auth_tag = VALUES(password_auth_tag),
           estado = VALUES(estado),
           updated_at = CURRENT_TIMESTAMP`,
        [
          sedeId,
          username,
          encrypted.cipherText,
          encrypted.iv,
          encrypted.authTag,
          estado
        ]
      );
    } else {
      await pool.query(
        `UPDATE urbano_credenciales_sede
         SET username = ?, estado = ?, updated_at = CURRENT_TIMESTAMP
         WHERE sede_id = ?`,
        [username, estado, sedeId]
      );
    }

    res.json({ ok: true, mensaje: 'Credenciales Urbano guardadas correctamente' });
  } catch (error: any) {
    console.error('Error al guardar credenciales Urbano:', error);
    const mensaje = error?.code === 'ER_NO_SUCH_TABLE'
      ? 'Ejecuta primero la migracion urbano_credenciales_sede'
      : error?.message || 'No se pudieron guardar las credenciales Urbano';
    res.status(500).json({ ok: false, mensaje });
  }
}

export async function eliminarCredencialUrbanoAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sedeId = Number(req.params.sedeId);

    if (!Number.isInteger(sedeId) || sedeId <= 0) {
      res.status(400).json({ ok: false, mensaje: 'Sede invalida' });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>(
      'DELETE FROM urbano_credenciales_sede WHERE sede_id = ?',
      [sedeId]
    );

    if (!result.affectedRows) {
      res.status(404).json({ ok: false, mensaje: 'Credencial Urbano no encontrada' });
      return;
    }

    res.json({ ok: true, mensaje: 'Credencial Urbano eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar credenciales Urbano:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudo eliminar la credencial Urbano' });
  }
}
