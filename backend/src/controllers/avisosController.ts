import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middlewares/authMiddleware';

function normalizarTelefono(telefono: string): string {
  return String(telefono || '').replace(/[^\d]/g, '').trim();
}

function normalizarTextoOpcional(value: unknown, maxLength: number): string | null {
  const clean = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean ? clean.slice(0, maxLength) : null;
}

function normalizarPesoKg(value: unknown): number | null {
  const raw = String(value ?? '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
    .trim();

  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 100000) return null;
  return Number(parsed.toFixed(3));
}

function normalizarEnteroPositivo(value: unknown): number | null {
  const parsed = Number(String(value ?? '').replace(/[^\d]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 9999) return null;
  return Math.floor(parsed);
}

// Crear aviso
export const crearAviso = async (req: AuthRequest, res: Response) => {
  try {
    const {
      lote_id,
      nombre,
      telefono,
      codigo_paquete,
      peso_kg,
      tipo_paquete_urbano,
      piezas,
      contenido_paquete,
      id_plantilla,
      mensaje
    } = req.body;

    const sede_id = req.user?.sede_id;

    if (!lote_id || !sede_id || !telefono) {
      return res.status(400).json({
        ok: false,
        message: 'lote_id y telefono son obligatorios'
      });
    }

    // Validar que el lote pertenezca a la sede del usuario
    const [loteRows]: any = await pool.query(
      `SELECT id
       FROM lotes_carga
       WHERE id = ? AND sede_id = ? AND fecha_eliminacion IS NULL
       LIMIT 1`,
      [lote_id, sede_id]
    );

    if (!loteRows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Lote no encontrado o no pertenece a tu sede'
      });
    }

    const limpioTelefono = normalizarTelefono(telefono);
    if (!limpioTelefono) {
      return res.status(400).json({
        ok: false,
        message: 'El teléfono es obligatorio y debe contener caracteres numéricos válidos'
      });
    }

    const [result]: any = await pool.query(
      `INSERT INTO avisos_diarios
      (lote_id, sede_id, nombre, telefono, codigo_paquete, peso_kg, tipo_paquete_urbano, piezas, contenido_paquete, id_plantilla, mensaje_personalizado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lote_id,
        sede_id,
        nombre || null,
        limpioTelefono,
        codigo_paquete || null,
        normalizarPesoKg(peso_kg),
        normalizarTextoOpcional(tipo_paquete_urbano, 80),
        normalizarEnteroPositivo(piezas),
        normalizarTextoOpcional(contenido_paquete, 255),
        id_plantilla || null,
        mensaje || null
      ]
    );

    // No actualizamos lotes_carga.total_registros porque usamos v_estadisticas_lotes

    return res.status(201).json({
      ok: true,
      message: 'Aviso creado correctamente',
      aviso_id: result.insertId
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al crear aviso',
      error: error.message
    });
  }
};

// Listar avisos del lote solo para la sede del usuario
export const listarAvisosPorLote = async (req: AuthRequest, res: Response) => {
  try {
    const { loteId } = req.params;
    const sede_id = req.user?.sede_id;

    const [rows] = await pool.query(
      `SELECT
        id,
        lote_id,
        sede_id,
        whatsapp_sesion_id,
        nombre,
        telefono,
        codigo_paquete,
        peso_kg,
        tipo_paquete_urbano,
        piezas,
        contenido_paquete,
        id_plantilla,
        mensaje_personalizado,
        estado_aviso,
        estado_entrega,
        whatsapp_message_id,
        fecha_envio,
        fecha_entrega,
        observacion_entrega,
        created_at
      FROM avisos_diarios
      WHERE lote_id = ? AND sede_id = ?
      ORDER BY id ASC`,
      [loteId, sede_id]
    );

    return res.json({
      ok: true,
      data: rows
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al listar avisos',
      error: error.message
    });
  }
};

// Actualizar estado solo si el aviso pertenece a la sede del usuario
export const actualizarEstadoAviso = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { estado_aviso } = req.body;
    const sede_id = req.user?.sede_id;

    if (!estado_aviso) {
      return res.status(400).json({
        ok: false,
        message: 'estado_aviso es obligatorio'
      });
    }

    const estadosValidos = ['pendiente', 'en_cola', 'enviado', 'enviado_manual', 'fallido', 'sin_whatsapp', 'cancelado'];

    if (!estadosValidos.includes(estado_aviso)) {
      return res.status(400).json({
        ok: false,
        message: 'Estado no válido'
      });
    }

    const [result]: any = await pool.query(
      `UPDATE avisos_diarios
       SET estado_aviso = ?
       WHERE id = ? AND sede_id = ?`,
      [estado_aviso, id, sede_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Aviso no encontrado'
      });
    }

    return res.json({
      ok: true,
      message: 'Estado actualizado correctamente'
    });
  } catch (error: any) {
    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar estado del aviso',
      error: error.message
    });
  }
};

export const importarAvisos = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { lote_id, avisos } = req.body;
    const sede_id = req.user?.sede_id;

    if (!lote_id || !sede_id || !Array.isArray(avisos) || avisos.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'lote_id y avisos son obligatorios'
      });
    }

    const [loteRows]: any = await connection.query(
      `SELECT id
       FROM lotes_carga
       WHERE id = ? AND sede_id = ? AND fecha_eliminacion IS NULL
       LIMIT 1`,
      [lote_id, sede_id]
    );

    if (!loteRows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Lote no encontrado o no pertenece a tu sede'
      });
    }

    const avisosValidos = avisos
      .map((item: any) => ({
        nombre: item.nombre?.trim() || null,
        telefono: normalizarTelefono(item.telefono),
        codigo_paquete: item.codigo_paquete?.trim() || null,
        peso_kg: normalizarPesoKg(item.peso_kg ?? item.peso),
        tipo_paquete_urbano: normalizarTextoOpcional(item.tipo_paquete_urbano ?? item.tipo_paquete, 80),
        piezas: normalizarEnteroPositivo(item.piezas),
        contenido_paquete: normalizarTextoOpcional(item.contenido_paquete ?? item.contenido, 255),
        id_plantilla: item.id_plantilla || null,
        mensaje_personalizado: item.mensaje?.trim() || null
      }))
      .filter((item: any) => item.telefono);

    if (!avisosValidos.length) {
      return res.status(400).json({
        ok: false,
        message: 'No hay filas validas para importar'
      });
    }

    await connection.beginTransaction();

    const values = avisosValidos.map((aviso: any) => [
      lote_id,
      sede_id,
      aviso.nombre,
      aviso.telefono,
      aviso.codigo_paquete,
      aviso.peso_kg,
      aviso.tipo_paquete_urbano,
      aviso.piezas,
      aviso.contenido_paquete,
      aviso.id_plantilla,
      aviso.mensaje_personalizado
    ]);

    await connection.query(
      `INSERT INTO avisos_diarios
      (lote_id, sede_id, nombre, telefono, codigo_paquete, peso_kg, tipo_paquete_urbano, piezas, contenido_paquete, id_plantilla, mensaje_personalizado)
      VALUES ?`,
      [values]
    );

    // Eliminado el update a lotes_carga.total_registros

    await connection.commit();

    return res.status(201).json({
      ok: true,
      message: 'Avisos importados correctamente',
      importados: avisosValidos.length
    });
  } catch (error: any) {
    await connection.rollback();
    return res.status(500).json({
      ok: false,
      message: 'Error al importar avisos',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

export const eliminarAviso = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const sede_id = req.user?.sede_id;

    const [rows]: any = await connection.query(
      `SELECT id, lote_id
       FROM avisos_diarios
       WHERE id = ? AND sede_id = ?
       LIMIT 1`,
      [id, sede_id]
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Destinatario no encontrado'
      });
    }

    const aviso = rows[0];

    await connection.beginTransaction();

    await connection.query(
      `DELETE FROM avisos_diarios
       WHERE id = ? AND sede_id = ?`,
      [id, sede_id]
    );

    // Eliminado UPDATE lotes_carga

    await connection.commit();

    return res.json({
      ok: true,
      message: 'Destinatario eliminado correctamente'
    });
  } catch (error: any) {
    await connection.rollback();
    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar destinatario',
      error: error.message
    });
  } finally {
    connection.release();
  }
};

export const eliminarAvisosPorLote = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { loteId } = req.params;
    const sede_id = req.user?.sede_id;

    const [loteRows]: any = await connection.query(
      `SELECT id
       FROM lotes_carga
       WHERE id = ? AND sede_id = ?
       LIMIT 1`,
      [loteId, sede_id]
    );

    if (!loteRows.length) {
      return res.status(404).json({
        ok: false,
        message: 'Lote no encontrado'
      });
    }

    await connection.beginTransaction();

    const [result]: any = await connection.query(
      `DELETE FROM avisos_diarios
       WHERE lote_id = ? AND sede_id = ?`,
      [loteId, sede_id]
    );

    // Eliminado UPDATE lotes_carga

    await connection.commit();

    return res.json({
      ok: true,
      message: 'Destinatarios del lote eliminados correctamente',
      eliminados: result.affectedRows || 0
    });
  } catch (error: any) {
    await connection.rollback();
    return res.status(500).json({
      ok: false,
      message: 'Error al vaciar el lote',
      error: error.message
    });
  } finally {
    connection.release();
  }
};
