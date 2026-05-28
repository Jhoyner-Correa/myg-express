import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../config/database';
import { esSuperadminUsuario } from '../utils/superadmin';

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
        message: 'Usuario o contraseña incorrectos'
      });
    }

    const user = rows[0];
    const es_superadmin = Boolean(user.es_superadmin) || esSuperadminUsuario(user.usuario);

    if (user.estado !== 'activo') {
      return res.status(403).json({
        ok: false,
        message: 'Usuario inactivo'
      });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);

    if (!passwordOk) {
      return res.status(401).json({
        ok: false,
        message: 'Usuario o contraseña incorrectos'
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        sede_id: user.sede_id,
        usuario: user.usuario,
        rol: user.rol,
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
        rol: user.rol,
        es_superadmin,
        sede_id: user.sede_id,
        sede_nombre: user.sede_nombre || 'Administración Central'
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al iniciar sesión',
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
