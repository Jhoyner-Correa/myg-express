import bcrypt from 'bcrypt';
import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database';
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
  sede_id: number;
  nombre: string;
  usuario: string;
  rol: string;
  es_superadmin: number;
  estado: 'activo' | 'inactivo';
  sede_nombre: string;
  created_at: string;
};

function validarTexto(value: unknown): string {
  return String(value || '').trim();
}

export async function obtenerResumenAdmin(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [[resumen]] = await pool.query<DashboardRow[]>(
      `SELECT
         (SELECT COUNT(*) FROM sedes) AS total_sedes,
         (SELECT COUNT(*) FROM sedes WHERE estado = 'activo') AS sedes_activas,
         (SELECT COUNT(*) FROM usuarios) AS total_usuarios,
         (SELECT COUNT(*) FROM lotes_carga WHERE fecha_eliminacion IS NULL) AS total_lotes,
         (SELECT COUNT(*) FROM lotes_carga WHERE estado IN ('pendiente', 'procesando') AND fecha_eliminacion IS NULL) AS lotes_activos,
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
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM usuarios GROUP BY sede_id) u ON u.sede_id = s.id
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
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM usuarios GROUP BY sede_id) u ON u.sede_id = s.id
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
  } catch (error: any) {
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
        mensaje: 'No se puede eliminar la sede porque ya tiene usuarios, lotes, sesiones o logs asociados en el historial.'
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
         COALESCE(s.nombre, 'Administración Central') AS sede_nombre,
         u.created_at
       FROM usuarios u
       LEFT JOIN sedes s ON s.id = u.sede_id
       ORDER BY u.created_at DESC, u.id DESC`
    );

    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar los usuarios' });
  }
}

export async function crearUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sede_id = Number(req.body.sede_id);
    const nombre = validarTexto(req.body.nombre);
    const usuario = validarTexto(req.body.usuario);
    const password = validarTexto(req.body.password);
    const estado = validarTexto(req.body.estado) || 'activo';
    const es_superadmin = 0;
    const rol = 'Encargado de Oficina';

    if (!sede_id || !nombre || !usuario || !password) {
      res.status(400).json({ ok: false, mensaje: 'Sede, nombre, usuario y contraseña son obligatorios' });
      return;
    }

    const [[sede]] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM sedes WHERE id = ? LIMIT 1',
      [sede_id]
    );

    if (!sede) {
      res.status(404).json({ ok: false, mensaje: 'La sede seleccionada no existe' });
      return;
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
    const mensaje =
      error?.code === 'ER_DUP_ENTRY'
        ? 'El nombre de usuario ya existe'
        : 'No se pudo crear el usuario';
    res.status(500).json({ ok: false, mensaje });
  }
}

export async function actualizarUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const sede_id = Number(req.body.sede_id);
    const nombre = validarTexto(req.body.nombre);
    const usuario = validarTexto(req.body.usuario);
    const password = validarTexto(req.body.password);
    const estado = validarTexto(req.body.estado) || 'activo';

    const [[existingUser]] = await pool.query<RowDataPacket[]>(
      'SELECT es_superadmin FROM usuarios WHERE id = ? LIMIT 1',
      [id]
    );
    if (!existingUser) {
      res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
      return;
    }
    const es_superadmin = existingUser.es_superadmin ? 1 : 0;
    const rol = es_superadmin ? 'Administrador de Sistemas (SysAdmin)' : 'Encargado de Oficina';
    const final_sede_id = es_superadmin ? null : Number(req.body.sede_id);

    if (!es_superadmin && !final_sede_id) {
      res.status(400).json({ ok: false, mensaje: 'La sede es obligatoria' });
      return;
    }
    if (!nombre || !usuario) {
      res.status(400).json({ ok: false, mensaje: 'Nombre y usuario son obligatorios' });
      return;
    }

    let sql = `UPDATE usuarios SET sede_id = ?, nombre = ?, usuario = ?, rol = ?, es_superadmin = ?, estado = ?`;
    const params: Array<string | number | null> = [final_sede_id, nombre, usuario, rol, es_superadmin, estado];

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
    const mensaje =
      error?.code === 'ER_DUP_ENTRY'
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
