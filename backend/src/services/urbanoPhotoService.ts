import { RowDataPacket } from 'mysql2';
import { pool } from '../core/database/database';
import {
  buildAjaxHeaders,
  getUrbanoSessionForContext,
  invalidateUrbanoSession,
  mapWithConcurrency,
  parseJsonResponse,
  URBANO_BASE_URL,
  URBANO_ROUTE_DETAILS,
  URBANO_TRACK_DETAILS,
  UrbanoSession,
  UrbanoSessionContext,
} from './urbanoService';

export type UrbanoPhotoItem = {
  img_id: string;
  img_path: string;
  img_thumbs: string;
  img_tipo: string;
  img_fecha_hora: string;
  img_px: number | null;
  img_py: number | null;
  img_puntaje: number | null;
};

export type UrbanoGuidePhotoStatus =
  | 'CON_FOTOS'
  | 'SIN_FOTOS'
  | 'SIN_DETALLE_RUTA'
  | 'NO_ENCONTRADA'
  | 'ERROR';

export type UrbanoGuidePhotosResult = {
  guia: string;
  gui_numero: string | null;
  man_id_det: string | null;
  route_id: string | null;
  origen: string | null;
  destino: string | null;
  estado_rastreo: string | null;
  destinatario: string | null;
  direccion: string | null;
  fecha_consulta: string;
  status: UrbanoGuidePhotoStatus;
  error_mensaje?: string;
  fotos_count: number;
  fotos: UrbanoPhotoItem[];
};

export type AuditLogEntry = {
  id: number;
  usuario_id: number;
  usuario_nombre?: string;
  sede_id: number | null;
  guia: string;
  man_id_det: string | null;
  tipo_operacion: 'CONSULTA' | 'SUBIDA' | 'ELIMINACION';
  img_id: string | null;
  resultado: 'EXITOSO' | 'ERROR';
  mensaje: string | null;
  detalles_json: any;
  created_at: string;
};

type ManIdDetRow = RowDataPacket & {
  guia: string;
  gui_numero: string | null;
  man_id_det: string;
  route_id: string | null;
};

const URBANO_PHOTOS_ENDPOINT = `${URBANO_BASE_URL}/plugin/sendimg/get_img_tracks/`;
const URBANO_UPLOAD_ENDPOINT = `${URBANO_BASE_URL}/plugin/sendimg/set_upload/`;
const URBANO_DELETE_ENDPOINT = `${URBANO_BASE_URL}/plugin/sendimg/scm_del_img/`;

/**
 * Ejecuta una operación contra Urbano reintentando en caso de que la sesión haya expirado.
 */
async function executeWithSessionRetry<T>(
  context: UrbanoSessionContext,
  action: (session: UrbanoSession) => Promise<T>
): Promise<T> {
  let session = await getUrbanoSessionForContext(context);
  try {
    return await action(session);
  } catch (error: any) {
    const errorMsg = String(error?.message || '').toLowerCase();
    const isSessionExpired =
      errorMsg.includes('sesion de urbano vencio') ||
      errorMsg.includes('json valido') ||
      errorMsg.includes('iniciar sesion');

    if (isSessionExpired) {
      invalidateUrbanoSession(context);
      session = await getUrbanoSessionForContext(context);
      return await action(session);
    }
    throw error;
  }
}

/**
 * Consulta fotografías registradas en Urbano para un man_id_det dado.
 */
export async function fetchUrbanoPhotos(
  context: UrbanoSessionContext,
  manIdDet: string
): Promise<UrbanoPhotoItem[]> {
  return executeWithSessionRetry(context, async (session) => {
    const response = await fetch(URBANO_PHOTOS_ENDPOINT, {
      method: 'POST',
      headers: {
        ...buildAjaxHeaders(session.phpSessionId),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        vp_rut_id: String(manIdDet).trim(),
        vp_linea: '3',
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const payload = await parseJsonResponse(response);

    if (!payload?.success || !Array.isArray(payload?.data)) {
      return [];
    }

    return payload.data.map((item: any) => ({
      img_id: String(item.img_id || ''),
      img_path: String(item.img_path || ''),
      img_thumbs: String(item.img_thumbs || item.img_path || ''),
      img_tipo: String(item.img_tipo || ''),
      img_fecha_hora: String(item.img_fecha_hora || ''),
      img_px: item.img_px !== null && item.img_px !== undefined ? Number(item.img_px) : null,
      img_py: item.img_py !== null && item.img_py !== undefined ? Number(item.img_py) : null,
      img_puntaje: item.img_puntaje !== null && item.img_puntaje !== undefined ? Number(item.img_puntaje) : null,
    }));
  });
}

/**
 * Consulta información de seguimiento (track) de una guía.
 */
async function fetchUrbanoTrack(
  context: UrbanoSessionContext,
  guia: string
): Promise<{
  found: boolean;
  guia_texto?: string;
  gui_numero?: string;
  rastreo?: string;
  origen?: string;
  destino?: string;
  estado?: string;
  destinatario?: string;
  direccion?: string;
}> {
  return executeWithSessionRetry(context, async (session) => {
    const trackUrl = new URL(URBANO_TRACK_DETAILS);
    trackUrl.searchParams.set('_dc', String(Date.now()));
    trackUrl.searchParams.set('vp_guia', guia);
    trackUrl.searchParams.set('vp_vigilancia', 'CSpescifica');
    trackUrl.searchParams.set('vp_linea', '3');
    trackUrl.searchParams.set('page', '1');
    trackUrl.searchParams.set('start', '0');
    trackUrl.searchParams.set('limit', '25');

    const response = await fetch(trackUrl, {
      headers: buildAjaxHeaders(session.phpSessionId),
      signal: AbortSignal.timeout(20_000),
    });

    const payload = await parseJsonResponse(response);

    if (
      !payload?.success ||
      !payload?.total ||
      !Array.isArray(payload?.data) ||
      !payload.data[0]
    ) {
      return { found: false };
    }

    const row = payload.data[0];
    return {
      found: true,
      guia_texto: row.guia_texto || row.guia || guia,
      gui_numero: row.gui_numero ? String(row.gui_numero) : undefined,
      rastreo: row.rastreo ? String(row.rastreo) : undefined,
      origen: row.origen ? String(row.origen) : undefined,
      destino: row.destino || row.localidad ? String(row.destino || row.localidad) : undefined,
      estado: row.estado ? String(row.estado) : undefined,
      destinatario: row.cliente || row.consignado ? String(row.cliente || row.consignado) : undefined,
      direccion: row.direccion ? String(row.direccion) : undefined,
    };
  });
}

/**
 * Resuelve e indexa en base de datos las guías de una ruta de manifiesto en Urbano.
 */
export async function resolveAndIndexRouteGuides(
  context: UrbanoSessionContext,
  routeId: string
): Promise<number> {
  const normalizedRouteId = String(routeId).trim();
  if (!normalizedRouteId) return 0;

  return executeWithSessionRetry(context, async (session) => {
    const manifestUrl = new URL(URBANO_ROUTE_DETAILS);
    manifestUrl.searchParams.set('_dc', String(Date.now()));
    manifestUrl.searchParams.set('vp_prov', '0');
    manifestUrl.searchParams.set('vp_man_id', '0');
    manifestUrl.searchParams.set('vp_rou_id', normalizedRouteId);
    manifestUrl.searchParams.set('vp_linea', '3');
    manifestUrl.searchParams.set('page', '1');
    manifestUrl.searchParams.set('start', '0');
    manifestUrl.searchParams.set('limit', '1000');

    const response = await fetch(manifestUrl, {
      headers: buildAjaxHeaders(session.phpSessionId),
      signal: AbortSignal.timeout(30_000),
    });

    const payload = await parseJsonResponse(response);
    const guias = Array.isArray(payload?.data) ? payload.data : [];

    if (!guias.length) return 0;

    let indexedCount = 0;
    for (const item of guias) {
      const guia = String(item.guia || item.guia_texto || '').trim().toUpperCase();
      const gui_numero = item.gui_numero ? String(item.gui_numero).trim() : null;
      const man_id_det = item.man_id_det ? String(item.man_id_det).trim() : null;

      if (guia && man_id_det) {
        await pool.query(
          `INSERT INTO urbano_guias_man_id_det (guia, gui_numero, man_id_det, route_id, sede_id)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             gui_numero = COALESCE(VALUES(gui_numero), gui_numero),
             man_id_det = VALUES(man_id_det),
             route_id = VALUES(route_id),
             sede_id = COALESCE(VALUES(sede_id), sede_id)`,
          [guia, gui_numero, man_id_det, normalizedRouteId, context.sedeId]
        );
        indexedCount++;
      }
    }

    return indexedCount;
  });
}

/**
 * Guarda o actualiza manualmente la asociación entre una guía y su man_id_det.
 */
export async function saveManualGuideMapping(
  guia: string,
  manIdDet: string,
  routeId?: string | null,
  sedeId?: number | null
): Promise<void> {
  const cleanGuia = String(guia).trim().toUpperCase();
  const cleanManId = String(manIdDet).trim();
  if (!cleanGuia || !cleanManId) return;

  await pool.query(
    `INSERT INTO urbano_guias_man_id_det (guia, man_id_det, route_id, sede_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       man_id_det = VALUES(man_id_det),
       route_id = COALESCE(VALUES(route_id), route_id),
       sede_id = COALESCE(VALUES(sede_id), sede_id)`,
    [cleanGuia, cleanManId, routeId || null, sedeId || null]
  );
}

/**
 * Busca man_id_det almacenados para una lista de guías (por código WYB o por gui_numero).
 */
export async function lookupStoredManIdDet(
  guides: string[]
): Promise<Map<string, { man_id_det: string; gui_numero: string | null; route_id: string | null }>> {
  const result = new Map<string, { man_id_det: string; gui_numero: string | null; route_id: string | null }>();
  if (!guides.length) return result;

  const cleanGuides = guides.map((g) => g.trim().toUpperCase()).filter(Boolean);
  if (!cleanGuides.length) return result;

  // Realizamos la consulta por lotes de hasta 200
  const chunkSize = 200;
  for (let i = 0; i < cleanGuides.length; i += chunkSize) {
    const chunk = cleanGuides.slice(i, i + chunkSize);
    const [rows] = await pool.query<ManIdDetRow[]>(
      `SELECT guia, gui_numero, man_id_det, route_id
       FROM urbano_guias_man_id_det
       WHERE guia IN (?) OR gui_numero IN (?)`,
      [chunk, chunk]
    );

    for (const row of rows) {
      const data = {
        man_id_det: row.man_id_det,
        gui_numero: row.gui_numero,
        route_id: row.route_id,
      };
      if (row.guia) result.set(row.guia.toUpperCase(), data);
      if (row.gui_numero) result.set(row.gui_numero.toUpperCase(), data);
    }
  }

  return result;
}

/**
 * Consulta masiva de guías: seguimiento + resolución man_id_det + fotografías.
 */
export async function processBulkGuidePhotos(
  context: UrbanoSessionContext,
  items: Array<{ guia: string; explicitManIdDet?: string }>,
  routeId?: string
): Promise<UrbanoGuidePhotosResult[]> {
  // 1. Si se aportó una ruta (vp_rou_id), indexar previamente
  if (routeId) {
    try {
      await resolveAndIndexRouteGuides(context, routeId);
    } catch (routeErr) {
      console.warn(`[urbanoPhotoService] No se pudo resolver automáticamente la ruta ${routeId}:`, routeErr);
    }
  }

  // 2. Extraer guías y consultar mapeos almacenados
  const guideCodes = items.map((i) => i.guia.trim().toUpperCase());
  const storedMappings = await lookupStoredManIdDet(guideCodes);

  // 3. Procesar concurrentemente (límite 5)
  const results = await mapWithConcurrency(
    items,
    5,
    async (item): Promise<UrbanoGuidePhotosResult> => {
      const rawGuide = item.guia.trim().toUpperCase();
      const consultationDate = new Date().toISOString();

      // Resolver man_id_det
      let manIdDet: string | null = item.explicitManIdDet?.trim() || null;
      let guiNumero: string | null = null;
      let assignedRouteId: string | null = routeId || null;

      if (!manIdDet) {
        const stored = storedMappings.get(rawGuide);
        if (stored) {
          manIdDet = stored.man_id_det;
          guiNumero = stored.gui_numero;
          assignedRouteId = stored.route_id || assignedRouteId;
        }
      }

      // 3.1 Consultar tracking de Urbano
      let trackInfo: Awaited<ReturnType<typeof fetchUrbanoTrack>> = { found: false };
      try {
        trackInfo = await fetchUrbanoTrack(context, rawGuide);
        if (trackInfo.found && trackInfo.gui_numero && !guiNumero) {
          guiNumero = trackInfo.gui_numero;
          // Si no teníamos man_id_det por el texto de la guía, buscar por gui_numero
          if (!manIdDet) {
            const byGuiNum = storedMappings.get(guiNumero.toUpperCase());
            if (byGuiNum) {
              manIdDet = byGuiNum.man_id_det;
              assignedRouteId = byGuiNum.route_id || assignedRouteId;
            }
          }
        }
      } catch (trackErr: any) {
        console.warn(`[urbanoPhotoService] Error en track para ${rawGuide}:`, trackErr?.message);
      }

      // Si track no encontró nada y no tenemos man_id_det
      if (!trackInfo.found && !manIdDet) {
        return {
          guia: rawGuide,
          gui_numero: guiNumero,
          man_id_det: null,
          route_id: assignedRouteId,
          origen: null,
          destino: null,
          estado_rastreo: null,
          destinatario: null,
          direccion: null,
          fecha_consulta: consultationDate,
          status: 'NO_ENCONTRADA',
          error_mensaje: 'Guía no encontrada en Urbano.',
          fotos_count: 0,
          fotos: [],
        };
      }

      // Si tenemos track pero no man_id_det
      if (!manIdDet) {
        return {
          guia: trackInfo.guia_texto || rawGuide,
          gui_numero: guiNumero,
          man_id_det: null,
          route_id: assignedRouteId,
          origen: trackInfo.origen || null,
          destino: trackInfo.destino || null,
          estado_rastreo: trackInfo.estado || null,
          destinatario: trackInfo.destinatario || null,
          direccion: trackInfo.direccion || null,
          fecha_consulta: consultationDate,
          status: 'SIN_DETALLE_RUTA',
          error_mensaje: 'No se encontró el identificador man_id_det para consultar fotos.',
          fotos_count: 0,
          fotos: [],
        };
      }

      // 3.2 Consultar fotografías con man_id_det
      try {
        const photos = await fetchUrbanoPhotos(context, manIdDet);
        return {
          guia: trackInfo.guia_texto || rawGuide,
          gui_numero: guiNumero,
          man_id_det: manIdDet,
          route_id: assignedRouteId,
          origen: trackInfo.origen || null,
          destino: trackInfo.destino || null,
          estado_rastreo: trackInfo.estado || null,
          destinatario: trackInfo.destinatario || null,
          direccion: trackInfo.direccion || null,
          fecha_consulta: consultationDate,
          status: photos.length > 0 ? 'CON_FOTOS' : 'SIN_FOTOS',
          fotos_count: photos.length,
          fotos: photos,
        };
      } catch (photoErr: any) {
        return {
          guia: trackInfo.guia_texto || rawGuide,
          gui_numero: guiNumero,
          man_id_det: manIdDet,
          route_id: assignedRouteId,
          origen: trackInfo.origen || null,
          destino: trackInfo.destino || null,
          estado_rastreo: trackInfo.estado || null,
          destinatario: trackInfo.destinatario || null,
          direccion: trackInfo.direccion || null,
          fecha_consulta: consultationDate,
          status: 'ERROR',
          error_mensaje: photoErr?.message || 'Error al obtener fotos de Urbano.',
          fotos_count: 0,
          fotos: [],
        };
      }
    }
  );

  return results;
}

/**
 * Sube una fotografía a Urbano para una guía (`man_id_det`).
 */
export async function uploadUrbanoPhoto(
  context: UrbanoSessionContext,
  manIdDet: string,
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<{ success: boolean; message: string }> {
  return executeWithSessionRetry(context, async (session) => {
    const formData = new FormData();
    formData.append('vp_img', String(manIdDet).trim());
    formData.append('vp_linea', '3');

    const blob = new Blob([fileBuffer], { type: mimeType || 'image/jpeg' });
    formData.append('plugin-file-img', blob, fileName || 'fotografia.jpg');

    const response = await fetch(URBANO_UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Cookie: `PHPSESSID=${session.phpSessionId}`,
        Referer: `${URBANO_BASE_URL}/inicio`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: formData,
      signal: AbortSignal.timeout(45_000),
    });

    const payload = await parseJsonResponse(response);

    if (payload?.success) {
      return {
        success: true,
        message: payload?.error_info || 'Se grabó correctamente la imagen en Urbano.',
      };
    }

    throw new Error(payload?.error_info || payload?.message || 'Error al subir la imagen en Urbano.');
  });
}

/**
 * Elimina una fotografía en Urbano identificada por `img_id` y `man_id_det`.
 */
export async function deleteUrbanoPhoto(
  context: UrbanoSessionContext,
  manIdDet: string,
  imgId: string
): Promise<{ success: boolean; message: string }> {
  return executeWithSessionRetry(context, async (session) => {
    const response = await fetch(URBANO_DELETE_ENDPOINT, {
      method: 'POST',
      headers: {
        ...buildAjaxHeaders(session.phpSessionId),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        vp_img_id: String(imgId).trim(),
        vp_man_id_det: String(manIdDet).trim(),
        vp_linea: '3',
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const payload = await parseJsonResponse(response);

    if (payload?.success) {
      const dataRow = Array.isArray(payload.data) ? payload.data[0] : null;
      if (dataRow && dataRow.error_sql === '-1') {
        throw new Error(dataRow.error_info || 'ID de foto no existe en Urbano.');
      }
      return {
        success: true,
        message: dataRow?.error_info || payload?.error_info || 'Fotografía eliminada satisfactoriamente.',
      };
    }

    throw new Error(payload?.error_info || payload?.message || 'Error al eliminar la fotografía en Urbano.');
  });
}

/**
 * Registra una acción en la bitácora de auditoría de fotografías.
 */
export async function logPhotoAudit(entry: {
  usuario_id: number;
  sede_id: number | null;
  guia: string;
  man_id_det?: string | null;
  tipo_operacion: 'CONSULTA' | 'SUBIDA' | 'ELIMINACION';
  img_id?: string | null;
  resultado: 'EXITOSO' | 'ERROR';
  mensaje?: string | null;
  detalles_json?: any;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO urbano_fotos_historial
        (usuario_id, sede_id, guia, man_id_det, tipo_operacion, img_id, resultado, mensaje, detalles_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.usuario_id,
        entry.sede_id,
        entry.guia.slice(0, 50),
        entry.man_id_det ? entry.man_id_det.slice(0, 30) : null,
        entry.tipo_operacion,
        entry.img_id ? entry.img_id.slice(0, 50) : null,
        entry.resultado,
        entry.mensaje || null,
        entry.detalles_json ? JSON.stringify(entry.detalles_json) : null,
      ]
    );
  } catch (err) {
    console.error('[urbanoPhotoService] Error al registrar historial de auditoría:', err);
  }
}

/**
 * Obtiene el historial de auditoría reciente.
 */
export async function getPhotoAuditHistory(options: {
  limit?: number;
  sedeId?: number | null;
  guia?: string;
}): Promise<AuditLogEntry[]> {
  const limit = Math.min(Math.max(options.limit || 50, 1), 200);
  const conditions: string[] = ['1=1'];
  const params: any[] = [];

  if (options.sedeId) {
    conditions.push('h.sede_id = ?');
    params.push(options.sedeId);
  }

  if (options.guia) {
    conditions.push('h.guia LIKE ?');
    params.push(`%${options.guia.trim()}%`);
  }

  params.push(limit);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT h.id, h.usuario_id, u.nombre as usuario_nombre, h.sede_id,
            h.guia, h.man_id_det, h.tipo_operacion, h.img_id, h.resultado,
            h.mensaje, h.detalles_json, h.created_at
     FROM urbano_fotos_historial h
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY h.id DESC
     LIMIT ?`,
    params
  );

  return rows.map((r) => ({
    id: r.id,
    usuario_id: r.usuario_id,
    usuario_nombre: r.usuario_nombre,
    sede_id: r.sede_id,
    guia: r.guia,
    man_id_det: r.man_id_det,
    tipo_operacion: r.tipo_operacion,
    img_id: r.img_id,
    resultado: r.resultado,
    mensaje: r.mensaje,
    detalles_json: typeof r.detalles_json === 'string' ? JSON.parse(r.detalles_json) : r.detalles_json,
    created_at: r.created_at,
  }));
}
