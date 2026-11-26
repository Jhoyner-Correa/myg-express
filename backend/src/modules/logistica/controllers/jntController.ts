import { Response } from 'express';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';
import { pool } from '../../../core/database/database';
import { businessDate } from '../../../core/utils/time';
import { parseJntPdf, JntPackage, aggregateConsignees, buildProfessionalJntBatchName, cleanJntText } from '../domain/jntDomain';

function requireSede(req: AuthRequest, res: Response): number | null {
  const sedeId = Number(req.user?.sede_id || req.body?.sede_id || req.query?.sede_id);
  if (!Number.isInteger(sedeId) || sedeId <= 0) {
    res.status(403).json({
      ok: false,
      message: 'Este módulo requiere estar asignado a una sede.'
    });
    return null;
  }
  return sedeId;
}

export const subirYProcesarPdf = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        ok: false,
        message: 'No se subió ningún archivo PDF.'
      });
    }

    const sedeId = requireSede(req, res);
    if (!sedeId) return;
    const userId = Number(req.user?.id);
    if (!userId) {
      return res.status(401).json({ ok: false, message: 'Sesión inválida.' });
    }

    // 1. Parse PDF using JntDomain
    const parseResult = await parseJntPdf(req.file.buffer);

    if (parseResult.totalPaginas === 0 || parseResult.paquetes.length === 0) {
      return res.status(422).json({
        ok: false,
        message: 'El archivo PDF no contiene guías válidas reconocibles de J&T Express.'
      });
    }

    const batchDisplayName = buildProfessionalJntBatchName({
      originalFilename: req.file.originalname,
      customName: req.body?.nombre_lote,
      distritos: parseResult.distritos,
      totalPaquetes: parseResult.totalPaquetes,
      fallbackIsoDate: businessDate()
    });

    // 2. Save in database
    const connection = await pool.getConnection();
    let loteJntId = 0;
    try {
      await connection.beginTransaction();

      const [loteRes]: any = await connection.query(
        `INSERT INTO jnt_lotes (sede_id, usuario_id, nombre_archivo, total_paginas, total_paquetes, total_consignados)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sedeId,
          userId,
          batchDisplayName,
          parseResult.totalPaginas,
          parseResult.totalPaquetes,
          parseResult.totalConsignados
        ]
      );
      loteJntId = loteRes.insertId;

      // Insert packages in chunks of 150
      const chunkSize = 150;
      for (let i = 0; i < parseResult.paquetes.length; i += chunkSize) {
        const chunk = parseResult.paquetes.slice(i, i + chunkSize);
        const rows = chunk.map(p => [
          loteJntId,
          sedeId,
          p.pagina,
          p.guia,
          p.consignado,
          p.telefono,
          p.distrito || null,
          p.provincia || null,
          p.departamento || null,
          p.direccion || null,
          p.codigoRuta || null,
          p.codigoPostal || null,
          p.pesoKg,
          p.contenido || null,
          p.piezas || 1
        ]);

        await connection.query(
          `INSERT INTO jnt_paquetes (
            lote_jnt_id, sede_id, pagina, guia, consignado, telefono, distrito, provincia, departamento, direccion, codigo_ruta, codigo_postal, peso_kg, contenido, piezas
          ) VALUES ?`,
          [rows]
        );
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    const [[savedLote]]: any = await pool.query(
      `SELECT l.*, s.nombre as sede_nombre, u.nombre as usuario_nombre
       FROM jnt_lotes l
       INNER JOIN sedes s ON s.id = l.sede_id
       INNER JOIN usuarios u ON u.id = l.usuario_id
       WHERE l.id = ?`,
      [loteJntId]
    );

    return res.status(201).json({
      ok: true,
      message: `Manifiesto "${batchDisplayName}" procesado: ${parseResult.totalPaquetes} paquetes en ${parseResult.totalPaginas} páginas`,
      lote_id: loteJntId,
      data: {
        ...parseResult,
        lote: savedLote
      }
    });
  } catch (error: any) {
    console.error('[jntController] subirYProcesarPdf error:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al procesar el archivo PDF de J&T: ' + (error.message || 'Error interno')
    });
  }
};

function isGlobalJntRole(rol: unknown): boolean {
  const normalized = String(rol || '').toLowerCase().replace(/[\s_-]+/g, '');
  return normalized === 'sysadmin' || normalized === 'gerenteempresa' || normalized === 'adminempresa';
}

export const listarLotesJnt = async (req: AuthRequest, res: Response) => {
  try {
    const sedeId = req.user?.sede_id;
    const isGlobal = !sedeId || isGlobalJntRole(req.user?.rol);

    let query = `
      SELECT 
        l.id,
        l.sede_id,
        s.nombre as sede_nombre,
        l.usuario_id,
        u.nombre as usuario_nombre,
        l.nombre_archivo,
        l.total_paginas,
        l.total_paquetes,
        l.total_consignados,
        l.lote_carga_id,
        lc.nombre_lote as ruta_whatsapp_nombre,
        lc.estado as ruta_whatsapp_estado,
        l.created_at
      FROM jnt_lotes l
      INNER JOIN sedes s ON s.id = l.sede_id
      INNER JOIN usuarios u ON u.id = l.usuario_id
      LEFT JOIN lotes_carga lc ON lc.id = l.lote_carga_id
    `;
    const params: any[] = [];

    if (!isGlobal && sedeId) {
      query += ` WHERE l.sede_id = ?`;
      params.push(sedeId);
    }

    query += ` ORDER BY l.id DESC LIMIT 100`;

    const [rows]: any = await pool.query(query, params);
    return res.json({ ok: true, data: rows });
  } catch (error: any) {
    console.error('[jntController] listarLotesJnt error:', error);
    return res.status(500).json({ ok: false, message: 'Error al listar lotes J&T' });
  }
};

export const obtenerDetalleLoteJnt = async (req: AuthRequest, res: Response) => {
  try {
    const loteId = Number(req.params.id);
    if (!loteId) {
      return res.status(400).json({ ok: false, message: 'ID de lote inválido' });
    }

    const [[lote]]: any = await pool.query(
      `SELECT 
        l.*,
        s.nombre as sede_nombre,
        u.nombre as usuario_nombre,
        lc.nombre_lote as ruta_whatsapp_nombre,
        lc.estado as ruta_whatsapp_estado
       FROM jnt_lotes l
       INNER JOIN sedes s ON s.id = l.sede_id
       INNER JOIN usuarios u ON u.id = l.usuario_id
       LEFT JOIN lotes_carga lc ON lc.id = l.lote_carga_id
       WHERE l.id = ?`,
      [loteId]
    );

    if (!lote) {
      return res.status(404).json({ ok: false, message: 'Lote J&T no encontrado' });
    }

    const [paquetes]: any = await pool.query(
      `SELECT * FROM jnt_paquetes WHERE lote_jnt_id = ? ORDER BY pagina ASC, id ASC`,
      [loteId]
    );

    const jntPackages: JntPackage[] = paquetes.map((p: any) => ({
      pagina: p.pagina,
      guia: p.guia,
      consignado: p.consignado,
      telefono: p.telefono,
      distrito: p.distrito || '',
      provincia: p.provincia || '',
      departamento: p.departamento || '',
      direccion: p.direccion || '',
      codigoRuta: p.codigo_ruta || '',
      codigoPostal: p.codigo_postal || '',
      pesoKg: p.peso_kg !== null ? Number(p.peso_kg) : null,
      contenido: p.contenido || '',
      piezas: p.piezas || 1
    }));

    const distritos: Record<string, number> = {};
    for (const p of jntPackages) {
      const d = p.distrito || 'DESCONOCIDO';
      distritos[d] = (distritos[d] || 0) + 1;
    }

    const consignados = aggregateConsignees(jntPackages);
    const consignadosMultiples = consignados.filter(c => c.totalPaquetes > 1).length;

    return res.json({
      ok: true,
      data: {
        lote,
        totalPaginas: lote.total_paginas,
        totalPaquetes: jntPackages.length,
        totalConsignados: consignados.length,
        consignadosMultiples,
        distritos,
        paquetes: jntPackages,
        consignados
      }
    });
  } catch (error: any) {
    console.error('[jntController] obtenerDetalleLoteJnt error:', error);
    return res.status(500).json({ ok: false, message: 'Error al obtener detalle del lote J&T' });
  }
};

export const renombrarLoteJnt = async (req: AuthRequest, res: Response) => {
  try {
    const loteId = Number(req.params.id);
    if (!loteId) {
      return res.status(400).json({ ok: false, message: 'ID de lote inválido' });
    }

    const nombre = cleanJntText(req.body?.nombre, 180);
    if (!nombre) {
      return res.status(400).json({ ok: false, message: 'El nombre del manifiesto es obligatorio' });
    }

    const sedeId = req.user?.sede_id;
    const isGlobal = !sedeId || isGlobalJntRole(req.user?.rol);

    const query = isGlobal
      ? `UPDATE jnt_lotes SET nombre_archivo = ? WHERE id = ?`
      : `UPDATE jnt_lotes SET nombre_archivo = ? WHERE id = ? AND sede_id = ?`;
    const params = isGlobal ? [nombre, loteId] : [nombre, loteId, sedeId];

    const [result]: any = await pool.query(query, params);
    if (!result.affectedRows) {
      return res.status(404).json({ ok: false, message: 'Manifiesto no encontrado o sin acceso' });
    }

    return res.json({ ok: true, message: 'Nombre actualizado correctamente', data: { id: loteId, nombre_archivo: nombre } });
  } catch (error: any) {
    console.error('[jntController] renombrarLoteJnt error:', error);
    return res.status(500).json({ ok: false, message: 'Error al renombrar el manifiesto J&T' });
  }
};

export const eliminarLoteJnt = async (req: AuthRequest, res: Response) => {
  try {
    const loteId = Number(req.params.id);
    if (!loteId) return res.status(400).json({ ok: false, message: 'ID inválido' });

    await pool.query(`DELETE FROM jnt_lotes WHERE id = ?`, [loteId]);
    return res.json({ ok: true, message: 'Lote J&T eliminado correctamente' });
  } catch (error: any) {
    console.error('[jntController] eliminarLoteJnt error:', error);
    return res.status(500).json({ ok: false, message: 'Error al eliminar lote J&T' });
  }
};

export const crearLoteWhatsAppDesdeJnt = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const {
      lote_jnt_id,
      nombre_lote,
      modo_agrupacion = 'individual',
      id_plantilla,
      mensaje_personalizado,
      distritos_filtro
    } = req.body;

    const loteJntId = Number(lote_jnt_id);
    if (!loteJntId) {
      return res.status(400).json({ ok: false, message: 'lote_jnt_id es obligatorio' });
    }

    const sedeId = requireSede(req, res);
    if (!sedeId) return;
    const userId = Number(req.user?.id);

    // Verify J&T batch exists
    const [[loteJnt]]: any = await connection.query(
      `SELECT * FROM jnt_lotes WHERE id = ?`,
      [loteJntId]
    );

    if (!loteJnt) {
      return res.status(404).json({ ok: false, message: 'Lote J&T no encontrado' });
    }

    // Fetch packages
    let queryPaquetes = `SELECT * FROM jnt_paquetes WHERE lote_jnt_id = ?`;
    const queryParams: any[] = [loteJntId];

    if (Array.isArray(distritos_filtro) && distritos_filtro.length > 0) {
      queryPaquetes += ` AND distrito IN (?)`;
      queryParams.push(distritos_filtro);
    }

    queryPaquetes += ` ORDER BY id ASC`;
    const [paquetes]: any = await connection.query(queryPaquetes, queryParams);

    if (paquetes.length === 0) {
      return res.status(400).json({ ok: false, message: 'No hay paquetes que coincidan con los filtros seleccionados' });
    }

    await connection.beginTransaction();

    // 1. Create route in lotes_carga
    const routeName = (nombre_lote || `J&T Express ${businessDate()}`).trim();
    const [loteCargaRes]: any = await connection.query(
      `INSERT INTO lotes_carga (sede_id, id_usuario_creador, fecha, zona, nombre_lote, estado)
       VALUES (?, ?, ?, 'J&T Express', ?, 'pendiente')`,
      [sedeId, userId, businessDate(), routeName]
    );
    const newLoteCargaId = loteCargaRes.insertId;

    // Link in jnt_lotes
    await connection.query(
      `UPDATE jnt_lotes SET lote_carga_id = ? WHERE id = ?`,
      [newLoteCargaId, loteJntId]
    );

    // 2. Prepare avisos_diarios
    const avisosToInsert: any[][] = [];

    if (modo_agrupacion === 'agrupado_por_cliente') {
      const clientMap = new Map<string, any[]>();
      for (const p of paquetes) {
        const key = `${p.consignado.toUpperCase().trim()}|${p.telefono}`;
        if (!clientMap.has(key)) clientMap.set(key, []);
        clientMap.get(key)!.push(p);
      }

      for (const [, clientPkgs] of clientMap.entries()) {
        const first = clientPkgs[0];
        const guias = clientPkgs.map(p => p.guia).join(', ');
        const totalPiezas = clientPkgs.reduce((acc, p) => acc + (Number(p.piezas) || 1), 0);
        const totalPeso = clientPkgs.reduce((acc, p) => acc + (Number(p.peso_kg) || 0), 0);
        const contenidos = Array.from(new Set(clientPkgs.map(p => p.contenido).filter(Boolean))).join(', ');

        avisosToInsert.push([
          newLoteCargaId,
          sedeId,
          first.consignado,
          first.telefono,
          guias,
          totalPeso > 0 ? totalPeso : null,
          'J&T Express',
          totalPiezas,
          contenidos || null,
          id_plantilla || null,
          mensaje_personalizado || null,
          'pendiente',
          'pendiente'
        ]);
      }
    } else {
      for (const p of paquetes) {
        avisosToInsert.push([
          newLoteCargaId,
          sedeId,
          p.consignado,
          p.telefono,
          p.guia,
          p.peso_kg,
          'J&T Express',
          p.piezas || 1,
          p.contenido || null,
          id_plantilla || null,
          mensaje_personalizado || null,
          'pendiente',
          'pendiente'
        ]);
      }
    }

    // Chunk insert into avisos_diarios
    const chunkSize = 150;
    for (let i = 0; i < avisosToInsert.length; i += chunkSize) {
      const chunk = avisosToInsert.slice(i, i + chunkSize);
      await connection.query(
        `INSERT INTO avisos_diarios (
          lote_id, sede_id, nombre, telefono, codigo_paquete, peso_kg, tipo_paquete_urbano, piezas, contenido_paquete, id_plantilla, mensaje_personalizado, estado_aviso, estado_entrega
        ) VALUES ?`,
        [chunk]
      );
    }

    await connection.commit();

    return res.status(201).json({
      ok: true,
      message: `Ruta "${routeName}" creada con éxito con ${avisosToInsert.length} avisos de WhatsApp listos para despachar`,
      lote_carga_id: newLoteCargaId,
      total_avisos: avisosToInsert.length
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('[jntController] crearLoteWhatsAppDesdeJnt error:', error);
    return res.status(500).json({
      ok: false,
      message: 'Error al crear ruta para WhatsApp: ' + (error.message || 'Error interno')
    });
  } finally {
    connection.release();
  }
};
