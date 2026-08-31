import { Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../../core/database/database';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';
import whatsappMediaStorage from '../../../services/whatsapp/media/whatsappMediaStorage';
import { unlink } from 'fs/promises';

type PlantillaRow = RowDataPacket & {
  id: number;
  nombre: string;
  contenido: string;
  imagen_path: string | null;
  sede_id: number;
};

type SedeConfiguracionRow = RowDataPacket & {
  plantilla_whatsapp_default_id: number | null;
};

function obtenerSedeId(req: AuthRequest): number | null {
  if (req.user?.tipo_usuario === 'SISTEMA') {
    const querySedeId = req.query.sede_id || req.body.sede_id;
    if (querySedeId) return Number(querySedeId);
  }
  return req.user?.sede_id ?? null;
}

export async function listarPlantillas(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sedeId = obtenerSedeId(req);

    if (!sedeId) {
      res.status(401).json({ ok: false, mensaje: 'Sesion no valida' });
      return;
    }

    const [rows] = await pool.query<PlantillaRow[]>(
      `SELECT id, nombre, contenido, contenido AS mensaje, imagen_path, sede_id
       FROM plantillas
       WHERE sede_id = ?
       ORDER BY id DESC`,
      [sedeId]
    );

    const [configRows] = await pool.query<SedeConfiguracionRow[]>(
      `SELECT plantilla_whatsapp_default_id
       FROM sede_configuracion
       WHERE sede_id = ?
       LIMIT 1`,
      [sedeId]
    );

    const configuredDefaultId = configRows[0]?.plantilla_whatsapp_default_id ?? null;
    const defaultExistsInSede = configuredDefaultId
      ? rows.some((plantilla) => Number(plantilla.id) === Number(configuredDefaultId))
      : false;

    res.json({
      ok: true,
      datos: rows,
      default_plantilla_id: defaultExistsInSede ? configuredDefaultId : null
    });
  } catch (error) {
    console.error('Error al listar plantillas:', error);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

export async function establecerPlantillaDefault(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sedeId = obtenerSedeId(req);
    const plantillaId = Number(req.body?.plantilla_id);

    if (!sedeId) {
      res.status(401).json({ ok: false, mensaje: 'Sesion no valida' });
      return;
    }

    if (!Number.isInteger(plantillaId) || plantillaId <= 0) {
      res.status(400).json({ ok: false, mensaje: 'plantilla_id es obligatorio' });
      return;
    }

    const [plantillaRows] = await pool.query<PlantillaRow[]>(
      `SELECT id
       FROM plantillas
       WHERE id = ?
         AND sede_id = ?
         AND estado = 'activo'
       LIMIT 1`,
      [plantillaId, sedeId]
    );

    if (!plantillaRows.length) {
      res.status(404).json({
        ok: false,
        mensaje: 'La plantilla no existe, esta inactiva o no pertenece a tu sede'
      });
      return;
    }

    await pool.query<ResultSetHeader>(
      `INSERT INTO sede_configuracion (sede_id, plantilla_whatsapp_default_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE
         plantilla_whatsapp_default_id = VALUES(plantilla_whatsapp_default_id),
         updated_at = CURRENT_TIMESTAMP`,
      [sedeId, plantillaId]
    );

    res.json({
      ok: true,
      mensaje: 'Plantilla predeterminada actualizada',
      default_plantilla_id: plantillaId
    });
  } catch (error) {
    console.error('Error al establecer plantilla predeterminada:', error);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

async function persistirImagen(imagenBase64: string, nombre: string, plantillaId: number): Promise<string> {
  const persisted = await whatsappMediaStorage.persistBase64Media(
    imagenBase64,
    nombre || `plantilla-${plantillaId}`,
    'plantillas'
  );
  return persisted.mediaPath;
}

async function borrarImagenDisco(imagenPath: string | null): Promise<void> {
  if (!imagenPath) return;
  try {
    // resolveAbsolutePath soporta rutas relativas nuevas y rutas absolutas legadas
    const absolutePath = whatsappMediaStorage.resolveAbsolutePath(imagenPath);
    await unlink(absolutePath);
  } catch (_error) {
    // El archivo ya no existe o no se puede borrar — no es crítico
  }
}

export async function crearPlantilla(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sedeId = obtenerSedeId(req);
    const { nombre, mensaje, imagen_base64, imagen_nombre } = req.body;

    if (!sedeId) {
      res.status(401).json({ ok: false, mensaje: 'Sesion no valida' });
      return;
    }

    if (!nombre || !mensaje) {
      res.status(400).json({ ok: false, mensaje: 'Los campos nombre y mensaje son obligatorios' });
      return;
    }

    let imagenPath: string | null = null;

    if (imagen_base64) {
      const tempId = Date.now();
      imagenPath = await persistirImagen(imagen_base64, imagen_nombre || `plantilla-${tempId}`, tempId);
    }

    const [resultado] = await pool.query<ResultSetHeader>(
      'INSERT INTO plantillas (nombre, contenido, imagen_path, sede_id) VALUES (?, ?, ?, ?)',
      [nombre, mensaje, imagenPath, sedeId]
    );

    res.status(201).json({
      ok: true,
      mensaje: 'Plantilla creada correctamente',
      id: resultado.insertId
    });
  } catch (error) {
    console.error('Error al crear plantilla:', error);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

export async function actualizarPlantilla(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sedeId = obtenerSedeId(req);
    const { id } = req.params;
    const { nombre, mensaje, imagen_base64, imagen_nombre, imagen_borrar } = req.body;

    if (!sedeId) {
      res.status(401).json({ ok: false, mensaje: 'Sesion no valida' });
      return;
    }

    if (!nombre || !mensaje) {
      res.status(400).json({ ok: false, mensaje: 'Los campos nombre y mensaje son obligatorios' });
      return;
    }

    const [existingRows] = await pool.query<PlantillaRow[]>(
      'SELECT id, imagen_path FROM plantillas WHERE id = ? AND sede_id = ? LIMIT 1',
      [id, sedeId]
    );

    if (!existingRows.length) {
      res.status(404).json({ ok: false, mensaje: 'Plantilla no encontrada' });
      return;
    }

    const oldImagenPath = existingRows[0].imagen_path;
    let newImagenPath: string | null | undefined;

    if (imagen_borrar) {
      await borrarImagenDisco(oldImagenPath);
      newImagenPath = null;
    } else if (imagen_base64) {
      await borrarImagenDisco(oldImagenPath);
      newImagenPath = await persistirImagen(imagen_base64, imagen_nombre || `plantilla-${id}`, Number(id));
    }

    const hasImageChange = newImagenPath !== undefined;

    if (hasImageChange) {
      await pool.query<ResultSetHeader>(
        'UPDATE plantillas SET nombre = ?, contenido = ?, imagen_path = ? WHERE id = ? AND sede_id = ?',
        [nombre, mensaje, newImagenPath, id, sedeId]
      );
    } else {
      await pool.query<ResultSetHeader>(
        'UPDATE plantillas SET nombre = ?, contenido = ? WHERE id = ? AND sede_id = ?',
        [nombre, mensaje, id, sedeId]
      );
    }

    res.json({ ok: true, mensaje: 'Plantilla actualizada correctamente' });
  } catch (error) {
    console.error('Error al actualizar plantilla:', error);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}

export async function eliminarPlantilla(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sedeId = obtenerSedeId(req);
    const { id } = req.params;

    if (!sedeId) {
      res.status(401).json({ ok: false, mensaje: 'Sesion no valida' });
      return;
    }

    const [existingRows] = await pool.query<PlantillaRow[]>(
      'SELECT id, imagen_path FROM plantillas WHERE id = ? AND sede_id = ? LIMIT 1',
      [id, sedeId]
    );

    if (!existingRows.length) {
      res.status(404).json({ ok: false, mensaje: 'Plantilla no encontrada' });
      return;
    }

    await borrarImagenDisco(existingRows[0].imagen_path);

    await pool.query<ResultSetHeader>(
      'DELETE FROM plantillas WHERE id = ? AND sede_id = ?',
      [id, sedeId]
    );

    res.json({ ok: true, mensaje: 'Plantilla eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar plantilla:', error);
    res.status(500).json({ ok: false, mensaje: 'Error interno del servidor' });
  }
}
