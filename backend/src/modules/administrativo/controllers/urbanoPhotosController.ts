import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import multer from 'multer';
import { pool } from '../../../core/database/database';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';
import { parseAdminSiteId } from '../domain/urbanoDispatchDomain';
import {
  deleteUrbanoPhoto,
  fetchUrbanoPhotos,
  getPhotoAuditHistory,
  logPhotoAudit,
  processBulkGuidePhotos,
  resolveAndIndexRouteGuides,
  saveManualGuideMapping,
  uploadUrbanoPhoto,
  UrbanoGuidePhotosResult,
} from '../../../services/urbanoPhotoService';

type SiteAuthRow = RowDataPacket & {
  id: number;
  nombre: string;
  integration_status: 'activo' | 'inactivo' | null;
};

// Configuración de multer en memoria para subida de fotos
const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes en formato JPG, PNG o WEBP.'));
    }
  },
}).single('foto');

export const uploadPhotoMiddleware = uploadMiddleware;

async function findAuthorizedSite(req: AuthRequest, siteId: number): Promise<SiteAuthRow | null> {
  const companyId = req.user?.empresa_id ?? null;
  const [rows] = await pool.query<SiteAuthRow[]>(
    `SELECT s.id, s.nombre, c.estado AS integration_status
       FROM sedes s
       LEFT JOIN urbano_credenciales_sede c ON c.sede_id = s.id
      WHERE s.id = ?
        AND s.estado = 'activo'
        AND (? IS NULL OR s.empresa_id = ?)
      LIMIT 1`,
    [siteId, companyId, companyId]
  );
  return rows[0] ?? null;
}

/**
 * Parsea el texto de entrada masivo de guías (líneas, comas, tabulaciones de Excel).
 * Admite pares opcionales como "WYB477212514,44383496" o "WYB477212514\t44383496".
 */
function parseGuidesInput(text: string): Array<{ guia: string; explicitManIdDet?: string }> {
  if (!text || typeof text !== 'string') return [];

  const lines = text.split(/[\r\n]+/);
  const map = new Map<string, { guia: string; explicitManIdDet?: string }>();

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Si la línea tiene comas o tabulaciones
    const parts = trimmed.split(/[\t,;]+/).map((p) => p.trim()).filter(Boolean);

    if (parts.length >= 2 && /^WYB\d+/i.test(parts[0]) && /^\d+$/.test(parts[1])) {
      // Formato: Guia + man_id_det explícito
      const guia = parts[0].toUpperCase();
      map.set(guia, { guia, explicitManIdDet: parts[1] });
    } else {
      for (const token of parts) {
        const cleanToken = token.trim().toUpperCase();
        if (cleanToken && !map.has(cleanToken)) {
          map.set(cleanToken, { guia: cleanToken });
        }
      }
    }
  }

  return Array.from(map.values()).slice(0, 1000);
}

/**
 * Consulta masiva de fotografías de guías.
 */
export async function consultarGuiasFotos(req: AuthRequest, res: Response): Promise<void> {
  try {
    const siteId = parseAdminSiteId(req.body.site_id);
    const site = await findAuthorizedSite(req, siteId);

    if (!site) {
      res.status(404).json({ ok: false, message: 'La sede seleccionada no está disponible.' });
      return;
    }
    if (site.integration_status !== 'activo') {
      res.status(409).json({
        ok: false,
        message: 'La sede seleccionada no tiene una integración Urbano activa con credenciales configuradas.',
      });
      return;
    }

    const rawInput =
      typeof req.body.text === 'string'
        ? req.body.text
        : Array.isArray(req.body.guides)
        ? req.body.guides.join('\n')
        : '';

    const items = parseGuidesInput(rawInput);
    if (!items.length) {
      res.status(400).json({ ok: false, message: 'Ingresa al menos un número de guía válido para consultar.' });
      return;
    }

    const routeId = req.body.route_id ? String(req.body.route_id).trim() : undefined;
    const context = {
      userId: Number(req.user!.id),
      sedeId: siteId,
    };

    const results = await processBulkGuidePhotos(context, items, routeId);

    // Resumen de estados
    const summary = {
      total: results.length,
      conFotos: results.filter((r) => r.status === 'CON_FOTOS').length,
      sinFotos: results.filter((r) => r.status === 'SIN_FOTOS').length,
      sinDetalleRuta: results.filter((r) => r.status === 'SIN_DETALLE_RUTA').length,
      noEncontradas: results.filter((r) => r.status === 'NO_ENCONTRADA').length,
      errores: results.filter((r) => r.status === 'ERROR').length,
    };

    // Bitácora de auditoría para la consulta masiva
    await logPhotoAudit({
      usuario_id: context.userId,
      sede_id: siteId,
      guia: items.length === 1 ? items[0].guia : `LOTE_${items.length}_GUIAS`,
      tipo_operacion: 'CONSULTA',
      resultado: 'EXITOSO',
      mensaje: `Consulta masiva de ${items.length} guías. Con fotos: ${summary.conFotos}, sin fotos: ${summary.sinFotos}.`,
      detalles_json: {
        total_consultadas: items.length,
        resumen: summary,
        route_id: routeId || null,
      },
    });

    res.json({
      ok: true,
      data: results,
      summary,
    });
  } catch (error: any) {
    console.error('[urbanoPhotosController] Error en consultarGuiasFotos:', error);
    res.status(500).json({
      ok: false,
      message: error?.message || 'Error al procesar la consulta masiva de fotografías.',
    });
  }
}

/**
 * Consulta las fotos de una guía específica por su man_id_det.
 */
export async function consultarFotosGuia(req: AuthRequest, res: Response): Promise<void> {
  try {
    const siteId = parseAdminSiteId(req.query.site_id);
    const site = await findAuthorizedSite(req, siteId);
    if (!site || site.integration_status !== 'activo') {
      res.status(403).json({ ok: false, message: 'Sede no autorizada o sin credenciales activas.' });
      return;
    }

    const manIdDet = String(req.params.manIdDet || '').trim();
    if (!manIdDet) {
      res.status(400).json({ ok: false, message: 'Identificador man_id_det requerido.' });
      return;
    }

    const context = {
      userId: Number(req.user!.id),
      sedeId: siteId,
    };

    const fotos = await fetchUrbanoPhotos(context, manIdDet);
    res.json({ ok: true, data: fotos });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || 'Error al consultar fotos de la guía.' });
  }
}

/**
 * Asocia manualmente o resuelve el man_id_det de una guía.
 */
export async function asociarManIdDetGuia(req: AuthRequest, res: Response): Promise<void> {
  try {
    const siteId = parseAdminSiteId(req.body.site_id);
    const site = await findAuthorizedSite(req, siteId);
    if (!site) {
      res.status(404).json({ ok: false, message: 'Sede no encontrada.' });
      return;
    }

    const guia = String(req.body.guia || '').trim().toUpperCase();
    const manIdDet = String(req.body.man_id_det || '').trim();
    const routeId = req.body.route_id ? String(req.body.route_id).trim() : null;

    if (!guia || !manIdDet) {
      res.status(400).json({ ok: false, message: 'Guía y man_id_det son obligatorios.' });
      return;
    }

    await saveManualGuideMapping(guia, manIdDet, routeId, siteId);
    res.json({ ok: true, message: 'Identificador asociado exitosamente.' });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || 'Error al asociar identificador.' });
  }
}

/**
 * Resuelve e indexa en masa las guías de una ruta de manifiesto de Urbano.
 */
export async function resolverRutaManifiesto(req: AuthRequest, res: Response): Promise<void> {
  try {
    const siteId = parseAdminSiteId(req.body.site_id);
    const site = await findAuthorizedSite(req, siteId);
    if (!site || site.integration_status !== 'activo') {
      res.status(403).json({ ok: false, message: 'Sede no autorizada o sin integración activa.' });
      return;
    }

    const routeId = String(req.body.route_id || '').trim();
    if (!routeId) {
      res.status(400).json({ ok: false, message: 'Número de ruta (vp_rou_id) obligatorio.' });
      return;
    }

    const context = {
      userId: Number(req.user!.id),
      sedeId: siteId,
    };

    const count = await resolveAndIndexRouteGuides(context, routeId);
    res.json({
      ok: true,
      count,
      message: count > 0
        ? `Se indexaron ${count} guías con su identificador man_id_det desde la ruta ${routeId}.`
        : `No se encontraron guías en la ruta ${routeId}.`,
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || 'Error al resolver ruta en Urbano.' });
  }
}

/**
 * Sube una fotografía para una guía en Urbano.
 */
export async function subirFotoGuia(req: AuthRequest, res: Response): Promise<void> {
  const siteId = parseAdminSiteId(req.body.site_id);
  const guia = String(req.body.guia || '').trim().toUpperCase();
  const manIdDet = String(req.body.man_id_det || '').trim();
  const userId = Number(req.user!.id);

  if (!req.file) {
    res.status(400).json({ ok: false, message: 'No se envió ningún archivo de imagen.' });
    return;
  }

  if (!manIdDet) {
    res.status(400).json({ ok: false, message: 'Identificador man_id_det obligatorio para subir foto.' });
    return;
  }

  const context = { userId, sedeId: siteId };

  try {
    const uploadResult = await uploadUrbanoPhoto(
      context,
      manIdDet,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // Re-consultar fotografías actualizadas
    const updatedPhotos = await fetchUrbanoPhotos(context, manIdDet);

    await logPhotoAudit({
      usuario_id: userId,
      sede_id: siteId,
      guia,
      man_id_det: manIdDet,
      tipo_operacion: 'SUBIDA',
      resultado: 'EXITOSO',
      mensaje: uploadResult.message,
      detalles_json: {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        total_fotos_actual: updatedPhotos.length,
      },
    });

    res.json({
      ok: true,
      message: uploadResult.message,
      fotos: updatedPhotos,
    });
  } catch (error: any) {
    await logPhotoAudit({
      usuario_id: userId,
      sede_id: siteId,
      guia,
      man_id_det: manIdDet,
      tipo_operacion: 'SUBIDA',
      resultado: 'ERROR',
      mensaje: error?.message || 'Error al subir foto.',
      detalles_json: {
        filename: req.file.originalname,
      },
    });

    res.status(500).json({
      ok: false,
      message: error?.message || 'Error al subir la fotografía a Urbano.',
    });
  }
}

/**
 * Elimina una fotografía en Urbano.
 */
export async function eliminarFotoGuia(req: AuthRequest, res: Response): Promise<void> {
  const siteId = parseAdminSiteId(req.body.site_id);
  const guia = String(req.body.guia || '').trim().toUpperCase();
  const manIdDet = String(req.body.man_id_det || '').trim();
  const imgId = String(req.body.img_id || '').trim();
  const userId = Number(req.user!.id);

  if (!manIdDet || !imgId) {
    res.status(400).json({ ok: false, message: 'man_id_det e img_id son obligatorios.' });
    return;
  }

  const context = { userId, sedeId: siteId };

  try {
    const deleteResult = await deleteUrbanoPhoto(context, manIdDet, imgId);

    // Re-consultar fotografías actualizadas
    const updatedPhotos = await fetchUrbanoPhotos(context, manIdDet);

    await logPhotoAudit({
      usuario_id: userId,
      sede_id: siteId,
      guia,
      man_id_det: manIdDet,
      img_id: imgId,
      tipo_operacion: 'ELIMINACION',
      resultado: 'EXITOSO',
      mensaje: deleteResult.message,
      detalles_json: {
        img_id: imgId,
        total_fotos_restantes: updatedPhotos.length,
      },
    });

    res.json({
      ok: true,
      message: deleteResult.message,
      fotos: updatedPhotos,
    });
  } catch (error: any) {
    await logPhotoAudit({
      usuario_id: userId,
      sede_id: siteId,
      guia,
      man_id_det: manIdDet,
      img_id: imgId,
      tipo_operacion: 'ELIMINACION',
      resultado: 'ERROR',
      mensaje: error?.message || 'Error al eliminar foto.',
      detalles_json: { img_id: imgId },
    });

    res.status(500).json({
      ok: false,
      message: error?.message || 'Error al eliminar la fotografía de Urbano.',
    });
  }
}

/**
 * Obtiene el historial de auditoría de fotos.
 */
export async function obtenerHistorialFotos(req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const siteId = req.query.site_id ? Number(req.query.site_id) : undefined;
    const guia = req.query.guia ? String(req.query.guia) : undefined;

    const data = await getPhotoAuditHistory({ limit, sedeId: siteId, guia });
    res.json({ ok: true, data });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error?.message || 'Error al obtener historial.' });
  }
}
