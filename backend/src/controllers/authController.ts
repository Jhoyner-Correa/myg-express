import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { getPermissionsForRole } from '../constants/permissions';
import { normalizeRole, roleRequiresSede } from '../constants/roles';

export const login = async (req: Request, res: Response) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({
        ok: false,
        message: 'usuario y password son obligatorios'
      });
    }

    const [rows]: any = await pool.query(
      `SELECT
          u.id,
          u.sede_id,
          u.nombre,
          u.usuario,
          u.password_hash,
          u.rol,
          u.es_superadmin,
          u.estado,
          s.nombre AS sede_nombre
       FROM usuarios u
       LEFT JOIN sedes s ON u.sede_id = s.id
       WHERE u.usuario = ?
       LIMIT 1`,
      [usuario]
    );

    if (!rows.length) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario o password incorrectos'
      });
    }

    const user = rows[0];
    const es_superadmin = Boolean(user.es_superadmin);
    const rol = normalizeRole(user.rol, es_superadmin);
    const sede_id = roleRequiresSede(rol) ? user.sede_id : null;
    const permisos = getPermissionsForRole(rol);

    if (user.estado !== 'activo') {
      return res.status(403).json({
        ok: false,
        message: 'Usuario inactivo'
      });
    }

    if (roleRequiresSede(rol) && !sede_id) {
      return res.status(403).json({
        ok: false,
        message: 'Usuario sin sede asignada'
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario o password incorrectos'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        sede_id,
        usuario: user.usuario,
        rol,
        es_superadmin
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '12h' }
    );

    return res.json({
      ok: true,
      message: 'Login correcto',
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        usuario: user.usuario,
        rol,
        es_superadmin,
        sede_id,
        sede_nombre: user.sede_nombre || 'Administracion Central',
        permisos
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al iniciar sesion',
      error: error.message
    });
  }
};

export const perfil = async (req: any, res: Response) => {
  try {
    return res.json({
      ok: true,
      user: req.user
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al obtener perfil',
      error: error.message
    });
  }
};

export const actualizarPerfil = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    const nombre = String(req.body.nombre || '').trim();
    const usuario = String(req.body.usuario || '').trim();
    const passwordActual = String(req.body.password_actual || '');
    const nuevoPassword = String(req.body.nuevo_password || '');

    if (!userId) {
      return res.status(401).json({
        ok: false,
        message: 'Sesion no valida'
      });
    }

    if (!nombre || !usuario) {
      return res.status(400).json({
        ok: false,
        message: 'Nombre y usuario son obligatorios'
      });
    }

    if (nuevoPassword && nuevoPassword.length < 6) {
      return res.status(400).json({
        ok: false,
        message: 'La nueva contrasena debe tener al menos 6 caracteres'
      });
    }

    const [rows]: any = await pool.query(
      `SELECT
          u.id,
          u.sede_id,
          u.nombre,
          u.usuario,
          u.password_hash,
          u.rol,
          u.es_superadmin,
          u.estado,
          s.nombre AS sede_nombre
       FROM usuarios u
       LEFT JOIN sedes s ON u.sede_id = s.id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado'
      });
    }

    const currentUser = rows[0];
    const params: any[] = [nombre, usuario];
    let passwordSql = '';

    if (nuevoPassword) {
      if (!passwordActual) {
        return res.status(400).json({
          ok: false,
          message: 'Ingresa tu contrasena actual para cambiarla'
        });
      }

      const passwordOk = await bcrypt.compare(passwordActual, currentUser.password_hash);
      if (!passwordOk) {
        return res.status(401).json({
          ok: false,
          message: 'La contrasena actual no es correcta'
        });
      }

      const hash = await bcrypt.hash(nuevoPassword, 10);
      passwordSql = ', password_hash = ?';
      params.push(hash);
    }

    params.push(userId);

    await pool.query(
      `UPDATE usuarios
       SET nombre = ?, usuario = ?${passwordSql}
       WHERE id = ?`,
      params
    );

    const es_superadmin = Boolean(currentUser.es_superadmin);
    const rol = normalizeRole(currentUser.rol, es_superadmin);
    const sede_id = roleRequiresSede(rol) ? currentUser.sede_id : null;
    const permisos = getPermissionsForRole(rol);

    return res.json({
      ok: true,
      message: 'Perfil actualizado correctamente',
      user: {
        id: currentUser.id,
        nombre,
        usuario,
        rol,
        es_superadmin,
        sede_id,
        sede_nombre: currentUser.sede_nombre || 'Administracion Central',
        permisos
      }
    });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        ok: false,
        message: 'El usuario ya esta en uso'
      });
    }

    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar perfil',
      error: error.message
    });
  }
};
