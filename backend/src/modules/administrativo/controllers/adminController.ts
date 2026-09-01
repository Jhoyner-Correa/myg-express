import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../../core/database/database';
import { encryptUrbanoPassword } from '../../../services/urbanoCredentialsService';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';
import {
  AccessValidationError,
  UserAccessAdminService,
} from '../services/UserAccessAdminService';

const userAccessAdminService = new UserAccessAdminService();

function auditContext(req: AuthRequest) {
  return {
    actorId: Number(req.user!.id),
    ip: req.ip || null,
    userAgent: req.get('user-agent') || null,
  };
}

function handleAccessError(error: unknown, res: Response, fallback: string): void {
  if (error instanceof AccessValidationError) {
    res.status(error.status).json({ ok: false, mensaje: error.message });
    return;
  }
  const duplicate = (error as { code?: string })?.code === 'ER_DUP_ENTRY';
  console.error(fallback, error);
  res.status(duplicate ? 409 : 500).json({
    ok: false,
    mensaje: duplicate ? 'El nombre de usuario ya existe' : fallback,
  });
}

type DashboardRow = RowDataPacket & {
  total_sedes: number;
  sedes_activas: number;
  total_usuarios: number;
  usuarios_activos: number;
  accesos_urbano_activos: number;
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

async function assertSedeExiste(sedeId: number): Promise<boolean> {
  const [[sede]] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM sedes WHERE id = ? LIMIT 1',
    [sedeId]
  );
  return Boolean(sede);
}

export async function obtenerResumenAdmin(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [[resumen]] = await pool.query<DashboardRow[]>(
      `SELECT
         (SELECT COUNT(*) FROM sedes) AS total_sedes,
         (SELECT COUNT(*) FROM sedes WHERE estado = 'activo') AS sedes_activas,
         (SELECT COUNT(*) FROM usuarios) AS total_usuarios,
         (SELECT COUNT(*) FROM usuarios WHERE estado = 'activo') AS usuarios_activos,
         (SELECT COUNT(*) FROM urbano_credenciales_sede WHERE estado = 'activo') AS accesos_urbano_activos,
         (SELECT COUNT(*) FROM lotes_carga WHERE fecha_eliminacion IS NULL) AS total_lotes,
         (SELECT COUNT(*) FROM lotes_carga WHERE estado IN ('borrador', 'pendiente', 'procesando') AND fecha_eliminacion IS NULL) AS lotes_activos,
         (SELECT COUNT(*)
            FROM avisos_diarios a
            INNER JOIN lotes_carga l ON l.id = a.lote_id AND l.sede_id = a.sede_id
           WHERE l.fecha_eliminacion IS NULL) AS total_destinatarios`
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
       LEFT JOIN (
         SELECT sede_id, COUNT(DISTINCT usuario_id) AS cnt
           FROM usuario_asignaciones
          WHERE alcance = 'SEDE' AND estado = 'ACTIVA'
          GROUP BY sede_id
       ) u ON u.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM whatsapp_sesiones GROUP BY sede_id) ws ON ws.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM lotes_carga WHERE fecha_eliminacion IS NULL GROUP BY sede_id) l ON l.sede_id = s.id
       LEFT JOIN (
         SELECT a.sede_id, COUNT(*) as cnt
         FROM avisos_diarios a
         INNER JOIN lotes_carga l ON l.id = a.lote_id AND l.sede_id = a.sede_id
         WHERE l.fecha_eliminacion IS NULL
         GROUP BY a.sede_id
       ) a ON a.sede_id = s.id
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
         s.latitud,
         s.longitud,
         s.radio_permitido_metros,
         COALESCE(u.cnt, 0) AS total_usuarios,
         COALESCE(ws.cnt, 0) AS total_sesiones,
         COALESCE(l.cnt, 0) AS total_lotes,
         COALESCE(a.cnt, 0) AS destinatarios
       FROM sedes s
       LEFT JOIN (
         SELECT sede_id, COUNT(DISTINCT usuario_id) AS cnt
           FROM usuario_asignaciones
          WHERE alcance = 'SEDE' AND estado = 'ACTIVA'
          GROUP BY sede_id
       ) u ON u.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM whatsapp_sesiones GROUP BY sede_id) ws ON ws.sede_id = s.id
       LEFT JOIN (SELECT sede_id, COUNT(*) as cnt FROM lotes_carga WHERE fecha_eliminacion IS NULL GROUP BY sede_id) l ON l.sede_id = s.id
       LEFT JOIN (
         SELECT a.sede_id, COUNT(*) as cnt
         FROM avisos_diarios a
         INNER JOIN lotes_carga l ON l.id = a.lote_id AND l.sede_id = a.sede_id
         WHERE l.fecha_eliminacion IS NULL
         GROUP BY a.sede_id
       ) a ON a.sede_id = s.id
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
    const latitud = req.body.latitud !== undefined && req.body.latitud !== '' ? Number(req.body.latitud) : null;
    const longitud = req.body.longitud !== undefined && req.body.longitud !== '' ? Number(req.body.longitud) : null;
    const radio_permitido_metros = req.body.radio_permitido_metros !== undefined && req.body.radio_permitido_metros !== '' ? Number(req.body.radio_permitido_metros) : null;

    if (!nombre) {
      res.status(400).json({ ok: false, mensaje: 'El nombre de la sede es obligatorio' });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO sedes
         (empresa_id, nombre, direccion, telefono, latitud, longitud, radio_permitido_metros, estado)
       SELECT id, ?, ?, ?, ?, ?, ?, 'activo'
         FROM empresas WHERE codigo = 'MYG_EXPRESS' AND estado = 'ACTIVA' LIMIT 1`,
      [nombre, direccion || null, telefono || null, latitud, longitud, radio_permitido_metros]
    );

    if (!result.affectedRows) {
      res.status(409).json({ ok: false, mensaje: 'La empresa MyG Express no está configurada' });
      return;
    }

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
    const latitud = req.body.latitud !== undefined && req.body.latitud !== '' ? Number(req.body.latitud) : null;
    const longitud = req.body.longitud !== undefined && req.body.longitud !== '' ? Number(req.body.longitud) : null;
    const radio_permitido_metros = req.body.radio_permitido_metros !== undefined && req.body.radio_permitido_metros !== '' ? Number(req.body.radio_permitido_metros) : null;

    if (!nombre) {
      res.status(400).json({ ok: false, mensaje: 'El nombre de la sede es obligatorio' });
      return;
    }

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE sedes
       SET nombre = ?, direccion = ?, telefono = ?, estado = ?, latitud = ?, longitud = ?, radio_permitido_metros = ?
       WHERE id = ?`,
      [nombre, direccion || null, telefono || null, estado, latitud, longitud, radio_permitido_metros, id]
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
         (SELECT COUNT(*) FROM usuario_asignaciones WHERE sede_id = ?) AS usuarios,
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
    res.json({ ok: true, data: await userAccessAdminService.listUsers() });
  } catch (error) {
    handleAccessError(error, res, 'No se pudieron cargar los usuarios');
  }
}

export async function obtenerCatalogoAccesosAdmin(_req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({ ok: true, data: await userAccessAdminService.getCatalog() });
  } catch (error) {
    handleAccessError(error, res, 'No se pudo cargar el catálogo de accesos');
  }
}

export async function obtenerDetalleUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, mensaje: 'Identificador de usuario inválido' });
      return;
    }
    res.json({ ok: true, data: await userAccessAdminService.getUserDetail(id) });
  } catch (error) {
    handleAccessError(error, res, 'No se pudo cargar el detalle del usuario');
  }
}

export async function crearUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = await userAccessAdminService.createUser({
      nombre: req.body.nombre,
      usuario: req.body.usuario,
      password: req.body.password,
      avatarVariant: req.body.avatar_variant,
      roleCode: req.body.role_code ?? req.body.rol,
      siteId: req.body.sede_id == null ? null : Number(req.body.sede_id),
      estado: req.body.estado,
      moduleCodes: req.body.module_codes,
    }, auditContext(req));

    res.status(201).json({
      ok: true,
      mensaje: 'Usuario creado correctamente',
      id,
    });
  } catch (error) {
    handleAccessError(error, res, 'No se pudo crear el usuario');
  }
}

export async function actualizarUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    await userAccessAdminService.updateUser(id, {
      nombre: req.body.nombre,
      usuario: req.body.usuario,
      password: req.body.password,
      avatarVariant: req.body.avatar_variant,
      roleCode: req.body.role_code ?? req.body.rol,
      siteId: req.body.sede_id == null ? null : Number(req.body.sede_id),
      estado: req.body.estado,
      moduleCodes: req.body.module_codes,
    }, auditContext(req));
    res.json({ ok: true, mensaje: 'Usuario actualizado correctamente' });
  } catch (error) {
    handleAccessError(error, res, 'No se pudo actualizar el usuario');
  }
}

export async function actualizarMisModulosAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const visibleModules = await userAccessAdminService.updateOwnModuleAccess(
      req.body.module_codes,
      auditContext(req),
    );
    res.json({
      ok: true,
      mensaje: 'Módulos visibles actualizados correctamente',
      data: { modulos_visibles: visibleModules },
    });
  } catch (error) {
    handleAccessError(error, res, 'No se pudieron actualizar tus módulos');
  }
}

export async function eliminarUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    await userAccessAdminService.suspendUser(Number(req.params.id), auditContext(req));
    res.json({ ok: true, mensaje: 'Usuario suspendido correctamente' });
  } catch (error) {
    handleAccessError(error, res, 'No se pudo suspender el usuario');
  }
}

export async function actualizarPasswordUsuarioAdmin(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ ok: false, mensaje: 'Identificador de usuario inválido' });
      return;
    }
    await userAccessAdminService.changePassword(id, {
      newPassword: req.body.nueva_password,
      currentPassword: req.body.password_actual,
    }, auditContext(req));
    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    handleAccessError(error, res, 'No se pudo actualizar la contraseña');
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
