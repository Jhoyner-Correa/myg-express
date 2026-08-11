import { Response } from 'express';
import { pool } from '../../../core/database/database';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';

// Listar zonas de la sede del usuario
export const listarZonas = async (req: AuthRequest, res: Response) => {
  try {
    const sede_id = req.user?.sede_id;
    if (!sede_id) {
      return res.status(400).json({ ok: false, message: 'Sede no identificada.' });
    }

    const [rows] = await pool.query(
      'SELECT id, nombre FROM zonas WHERE sede_id = ? ORDER BY nombre ASC',
      [sede_id]
    );

    return res.json({
      ok: true,
      data: rows
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al listar zonas',
      error: error.message
    });
  }
};

// Crear zona
export const crearZona = async (req: AuthRequest, res: Response) => {
  try {
    const sede_id = req.user?.sede_id;
    const { nombre } = req.body;

    if (!sede_id) {
      return res.status(400).json({ ok: false, message: 'Sede no identificada.' });
    }

    const zoneName = String(nombre || '').trim();
    if (!zoneName) {
      return res.status(400).json({ ok: false, message: 'El nombre de la zona es obligatorio.' });
    }

    if (/\d/.test(zoneName)) {
      return res.status(400).json({ ok: false, message: 'El nombre de la zona no puede contener números.' });
    }

    // Insertar ignorando duplicados
    await pool.query(
      'INSERT INTO zonas (sede_id, nombre) VALUES (?, ?)',
      [sede_id, zoneName]
    );

    return res.status(201).json({
      ok: true,
      message: 'Zona creada correctamente.'
    });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        ok: false,
        message: 'Esta zona ya existe para tu sede.'
      });
    }
    return res.status(500).json({
      ok: false,
      message: 'Error al crear zona.',
      error: error.message
    });
  }
};

// Eliminar zona
export const eliminarZona = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const sede_id = req.user?.sede_id;

    if (!sede_id) {
      return res.status(400).json({ ok: false, message: 'Sede no identificada.' });
    }

    const [result]: any = await pool.query(
      'DELETE FROM zonas WHERE id = ? AND sede_id = ?',
      [id, sede_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        message: 'La opción a eliminar no existe o no pertenece a tu sede.'
      });
    }

    return res.json({
      ok: true,
      message: 'Zona eliminada correctamente.'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar zona.',
      error: error.message
    });
  }
};
