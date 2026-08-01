import { Response } from 'express';
import { pool } from '../config/database';
import { AuthRequest } from '../middlewares/authMiddleware';

function requireSede(req: AuthRequest, res: Response): number | null {
  const sedeId = Number(req.user?.sede_id);
  if (!Number.isFinite(sedeId) || sedeId <= 0) {
    res.status(403).json({
      ok: false,
      message: 'Este módulo solo está disponible para usuarios asignados a una sede.'
    });
    return null;
  }
  return sedeId;
}

// 1. Procesar Escaneo (Individual)
export const procesarEscaneo = async (req: AuthRequest, res: Response) => {
  try {
    const { codigo, lote_activo } = req.body;
    const cleanCodigo = String(codigo || '').replace(/[\r\n\t]/g, '').trim();
    const cleanLoteActivo = String(lote_activo || '').trim();
    
    if (!cleanCodigo) {
      return res.status(400).json({
        ok: false,
        message: 'El código de paquete es obligatorio.'
      });
    }

    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const usuarioId = req.user?.id;
    if (!usuarioId) {
      return res.status(401).json({
        ok: false,
        message: 'Sesión inválida o expirada.'
      });
    }

    // Buscar paquete en la base de datos (limpiando espacios y soportando mayúsculas)
    const [rows]: any = await pool.query(
      'SELECT * FROM paquetes WHERE TRIM(codigo_paquete) = ? OR TRIM(codigo_paquete) = ? LIMIT 1',
      [cleanCodigo, cleanCodigo.toUpperCase()]
    );

    if (rows.length === 0) {
      // Registrar incidencia: NO EXISTE EN NINGÚN LADO
      await pool.query(
        `INSERT INTO paquetes_auditoria (codigo_escaneado, tipo_incidencia, usuario_id, sede_id)
         VALUES (?, 'NO_EXISTE', ?, ?)`,
        [cleanCodigo, usuarioId, sedeId]
      );

      return res.status(404).json({
        ok: false,
        estado: 'NO EXISTE',
        message: 'El paquete no existe en el sistema.'
      });
    }

    const paquete = rows[0];

    // Validación de pertenencia al lote activo seleccionado en el frontend
    if (cleanLoteActivo && paquete.lote_importacion !== cleanLoteActivo) {
      // Registrar incidencia: PERTENECE A OTRO LOTE
      await pool.query(
        `INSERT INTO paquetes_auditoria (codigo_escaneado, tipo_incidencia, usuario_id, sede_id)
         VALUES (?, 'OTRO_LOTE', ?, ?)`,
        [cleanCodigo, usuarioId, sedeId]
      );

      return res.status(422).json({
        ok: false,
        estado: 'OTRO_LOTE',
        message: `El paquete pertenece a otro lote: "${paquete.lote_importacion}".`,
        data: paquete
      });
    }

    // Si ya fue escaneado anteriormente
    if (paquete.estado === 'LLEGÓ') {
      // Registrar incidencia: DUPLICADO
      await pool.query(
        `INSERT INTO paquetes_auditoria (codigo_escaneado, tipo_incidencia, usuario_id, sede_id)
         VALUES (?, 'DUPLICADO', ?, ?)`,
        [cleanCodigo, usuarioId, sedeId]
      );

      // Obtener el nombre del operador que lo escaneó antes
      const [opRows]: any = await pool.query(
        'SELECT nombre FROM usuarios WHERE id = ? LIMIT 1',
        [paquete.usuario_id_escaneo]
      );
      const operadorPrevio = opRows?.[0]?.nombre || 'Operador Desconocido';

      return res.status(409).json({
        ok: false,
        estado: 'DUPLICADO',
        message: `Este código ya fue escaneado por ${operadorPrevio} el ${new Date(paquete.fecha_escaneo).toLocaleString('es-PE')}.`,
        data: paquete
      });
    }

    // Registrar llegada del paquete
    await pool.query(
      `UPDATE paquetes
          SET estado = 'LLEGÓ',
              fecha_escaneo = NOW(),
              usuario_id_escaneo = ?,
              sede_id_escaneo = ?
        WHERE id = ?`,
      [usuarioId, sedeId, paquete.id]
    );

    // Obtener datos actualizados del paquete
    const [updatedRows]: any = await pool.query(
      'SELECT * FROM paquetes WHERE id = ? LIMIT 1',
      [paquete.id]
    );
    const paqueteActualizado = updatedRows[0];

    return res.status(200).json({
      ok: true,
      estado: 'LLEGÓ',
      message: 'Paquete registrado con éxito.',
      data: paqueteActualizado
    });

  } catch (error: any) {
    console.error('[savar-scan] Error al procesar escaneo:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error interno al procesar el escaneo.',
      error: error.message
    });
  }
};

// 2. Importar Paquetes (Carga Masiva de Catálogo con Lote)
export const importarPaquetes = async (req: AuthRequest, res: Response) => {
  try {
    const { paquetes, lote_importacion } = req.body;
    
    const cleanLote = String(lote_importacion || '').trim();
    if (!cleanLote) {
      return res.status(400).json({
        ok: false,
        message: 'El nombre del lote de importación es obligatorio.'
      });
    }

    if (!Array.isArray(paquetes) || paquetes.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'Debe proporcionar una lista de paquetes para importar.'
      });
    }

    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    // Estructurar registros para inserción masiva
    const insertData = paquetes.map((p: any) => [
      String(p.codigo || p.codigo_paquete || '').trim(),
      String(p.consignado || '').trim(),
      String(p.direccion || '').trim(),
      String(p.telefono || '').trim() || null,
      String(p.departamento || '').trim(),
      String(p.provincia || '').trim(),
      String(p.distrito || '').trim(),
      cleanLote,
      'PENDIENTE'
    ]).filter((p: any) => p[0] && p[1]);

    if (insertData.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'Ningún paquete de la lista es válido (debe tener Código y Consignado).'
      });
    }

    // Inserción en bloques con ON DUPLICATE KEY UPDATE
    const query = `
      INSERT INTO paquetes 
        (codigo_paquete, consignado, direccion, telefono, departamento, provincia, distrito, lote_importacion, estado)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        consignado = VALUES(consignado),
        direccion = VALUES(direccion),
        telefono = VALUES(telefono),
        departamento = VALUES(departamento),
        provincia = VALUES(provincia),
        distrito = VALUES(distrito),
        lote_importacion = VALUES(lote_importacion)
    `;

    const [result]: any = await pool.query(query, [insertData]);

    return res.status(200).json({
      ok: true,
      message: `Procesados correctamente. Creados/actualizados: ${result.affectedRows} registros en lote "${cleanLote}".`
    });

  } catch (error: any) {
    console.error('[savar-scan] Error al importar paquetes:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al importar los paquetes a la base de datos.',
      error: error.message
    });
  }
};

// 3. Listar Paquetes (con filtro de Lote e Historial de la Sede)
export const listarPaquetes = async (req: AuthRequest, res: Response) => {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const estado = String(req.query.estado || '').trim(); // PENDIENTE, LLEGÓ
    const lote_importacion = String(req.query.lote_importacion || '').trim();
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);

    const conditions: string[] = [];
    const params: any[] = [];

    if (estado === 'LLEGÓ') {
      conditions.push('p.estado = "LLEGÓ" AND p.sede_id_escaneo = ?');
      params.push(sedeId);
    } else if (estado === 'PENDIENTE') {
      conditions.push('p.estado = "PENDIENTE"');
    }

    if (lote_importacion) {
      conditions.push('p.lote_importacion = ?');
      params.push(lote_importacion);
    }

    if (q) {
      conditions.push('(p.codigo_paquete LIKE ? OR p.consignado LIKE ? OR p.telefono LIKE ?)');
      const likeVal = `%${q}%`;
      params.push(likeVal, likeVal, likeVal);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const query = `
      SELECT 
        p.*,
        u.nombre AS operador_escaneo_nombre,
        s.nombre AS sede_escaneo_nombre
      FROM paquetes p
      LEFT JOIN usuarios u ON u.id = p.usuario_id_escaneo
      LEFT JOIN sedes s ON s.id = p.sede_id_escaneo
      ${whereClause}
      ORDER BY p.updated_at DESC
      LIMIT ?
    `;
    params.push(limit);

    const [rows] = await pool.query(query, params);

    return res.status(200).json({
      ok: true,
      data: rows
    });

  } catch (error: any) {
    console.error('[savar-scan] Error al listar paquetes:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al listar los paquetes.',
      error: error.message
    });
  }
};

// 4. Listar Lotes de Importación Únicos y Estadísticas
export const listarLotes = async (req: AuthRequest, res: Response) => {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const query = `
      SELECT 
        lote_importacion AS nombre,
        MIN(created_at) AS fecha_creacion,
        COUNT(*) AS total,
        SUM(CASE WHEN estado = 'LLEGÓ' AND sede_id_escaneo = ? THEN 1 ELSE 0 END) AS recibidos,
        SUM(CASE WHEN estado = 'PENDIENTE' THEN 1 ELSE 0 END) AS pendientes
      FROM paquetes
      GROUP BY lote_importacion
      ORDER BY fecha_creacion DESC
    `;

    const [rows] = await pool.query(query, [sedeId]);

    return res.status(200).json({
      ok: true,
      data: rows
    });

  } catch (error: any) {
    console.error('[savar-scan] Error al listar lotes:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al listar los lotes de importación.',
      error: error.message
    });
  }
};

// 5. Obtener Listado de Faltantes de un Lote Específico
export const listarFaltantes = async (req: AuthRequest, res: Response) => {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    const lote = String(req.query.lote || '').trim();

    if (!lote) {
      return res.status(400).json({
        ok: false,
        message: 'El parámetro "lote" es obligatorio.'
      });
    }

    const [rows] = await pool.query(
      `SELECT codigo_paquete, consignado, direccion, distrito, telefono 
       FROM paquetes 
       WHERE lote_importacion = ? AND estado = 'PENDIENTE'
       ORDER BY consignado ASC`,
      [lote]
    );

    return res.status(200).json({
      ok: true,
      data: rows
    });

  } catch (error: any) {
    console.error('[savar-scan] Error al listar faltantes:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al listar los paquetes faltantes.',
      error: error.message
    });
  }
};

// 6. Restablecer Escaneos
export const restablecerEscaneos = async (req: AuthRequest, res: Response) => {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    // Permitido para todos los usuarios autenticados de la Sede

    const lote = String(req.query.lote || '').trim();

    let queryUpdate = `
      UPDATE paquetes
         SET estado = 'PENDIENTE',
             fecha_escaneo = NULL,
             usuario_id_escaneo = NULL,
             sede_id_escaneo = NULL
       WHERE sede_id_escaneo = ?
    `;
    let queryDeleteAud = 'DELETE FROM paquetes_auditoria WHERE sede_id = ?';
    const paramsUpdate: any[] = [sedeId];
    const paramsAud = [sedeId];

    if (lote) {
      queryUpdate += ' AND lote_importacion = ?';
      paramsUpdate.push(lote);
    }

    const [result]: any = await pool.query(queryUpdate, paramsUpdate);
    await pool.query(queryDeleteAud, paramsAud);

    return res.status(200).json({
      ok: true,
      message: `Escaneos restablecidos con éxito. Se restablecieron ${result.affectedRows} paquetes.`
    });

  } catch (error: any) {
    console.error('[savar-scan] Error al restablecer escaneos:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al restablecer los escaneos.',
      error: error.message
    });
  }
};

// 7. Eliminar Lote de Importación Completo (Lote + Paquetes)
export const eliminarLote = async (req: AuthRequest, res: Response) => {
  try {
    const sedeId = requireSede(req, res);
    if (!sedeId) return;

    // Permitido para todos los usuarios autenticados de la Sede

    const nombreLote = String(req.params.nombre || '').trim();
    if (!nombreLote) {
      return res.status(400).json({
        ok: false,
        message: 'Debe especificar el nombre del lote a eliminar.'
      });
    }

    // 1. Eliminar auditorías/incidencias asociadas a los paquetes de este lote
    const deleteAuditoriaQuery = `
      DELETE pa FROM paquetes_auditoria pa
      INNER JOIN paquetes p ON pa.codigo_escaneado = p.codigo_paquete
      WHERE p.lote_importacion = ?
    `;
    await pool.query(deleteAuditoriaQuery, [nombreLote]);

    // 2. Eliminar los paquetes del lote
    const deletePaquetesQuery = `
      DELETE FROM paquetes WHERE lote_importacion = ?
    `;
    const [result]: any = await pool.query(deletePaquetesQuery, [nombreLote]);

    return res.status(200).json({
      ok: true,
      message: `El lote "${nombreLote}" y sus ${result.affectedRows} paquetes asociados fueron eliminados con éxito.`
    });

  } catch (error: any) {
    console.error('[savar-scan] Error al eliminar lote:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al eliminar el lote de importación.',
      error: error.message
    });
  }
};
