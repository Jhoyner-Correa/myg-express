import { Response } from 'express';
import { RowDataPacket } from 'mysql2';

import { pool } from '../../../core/database/database';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';
import { fetchDispatches, fetchDispatchGuides, fetchGuideDetails } from '../../../services/urbanoService';
import {
  parseAdminSiteId,
  parseUrbanoGuide,
  parseUrbanoDispatchListQuery,
  parseUrbanoDispatchQuery,
  publicUrbanoDispatchErrorMessage,
  UrbanoDispatchValidationError,
} from '../domain/urbanoDispatchDomain';

type DispatchSiteRow = RowDataPacket & {
  id: number;
  nombre: string;
  integration_status: 'activo' | 'inactivo' | null;
};

async function findAuthorizedSite(req: AuthRequest, siteId: number): Promise<DispatchSiteRow | null> {
  const companyId = req.user?.empresa_id ?? null;
  const [rows] = await pool.query<DispatchSiteRow[]>(
    `SELECT s.id, s.nombre, c.estado AS integration_status
       FROM sedes s
       LEFT JOIN urbano_credenciales_sede c ON c.sede_id = s.id
      WHERE s.id = ?
        AND s.estado = 'activo'
        AND (? IS NULL OR s.empresa_id = ?)
      LIMIT 1`,
    [siteId, companyId, companyId],
  );
  return rows[0] ?? null;
}

export async function listarDespachosUrbano(req: AuthRequest, res: Response): Promise<void> {
  try {
    const siteId = parseAdminSiteId(req.query.site_id);
    const query = parseUrbanoDispatchListQuery(req.query as Record<string, unknown>);
    const site = await findAuthorizedSite(req, siteId);

    if (!site) {
      res.status(404).json({ ok: false, message: 'La sede seleccionada no esta disponible.' });
      return;
    }
    if (site.integration_status !== 'activo') {
      res.status(409).json({
        ok: false,
        message: 'La sede seleccionada no tiene una integracion Urbano activa.',
      });
      return;
    }

    const data = await fetchDispatches({
      userId: Number(req.user!.id),
      sedeId: siteId,
    }, query);

    res.json({
      ok: true,
      data: { ...data, site: { id: siteId, name: site.nombre } },
    });
  } catch (error) {
    if (error instanceof UrbanoDispatchValidationError) {
      res.status(400).json({ ok: false, message: error.message });
      return;
    }
    console.error('[urbano-despachos] Error al listar despachos:', error);
    res.status(502).json({ ok: false, message: publicUrbanoDispatchErrorMessage(error) });
  }
}

export async function listarSedesDespachosUrbano(req: AuthRequest, res: Response): Promise<void> {
  try {
    const companyId = req.user?.empresa_id ?? null;
    const [rows] = await pool.query<DispatchSiteRow[]>(
      `SELECT s.id, s.nombre, c.estado AS integration_status
         FROM sedes s
         LEFT JOIN urbano_credenciales_sede c ON c.sede_id = s.id
        WHERE s.estado = 'activo'
          AND (? IS NULL OR s.empresa_id = ?)
        ORDER BY s.nombre ASC`,
      [companyId, companyId],
    );

    res.json({
      ok: true,
      data: rows.map((row) => ({
        id: Number(row.id),
        name: row.nombre,
        integrationStatus: row.integration_status ?? 'sin_configurar',
        available: row.integration_status === 'activo',
      })),
    });
  } catch (error: any) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      res.status(409).json({
        ok: false,
        message: 'Falta configurar las credenciales Urbano por sede.',
      });
      return;
    }
    console.error('[urbano-despachos] Error al listar sedes:', error);
    res.status(500).json({ ok: false, message: 'No se pudieron cargar las sedes disponibles.' });
  }
}

export async function consultarGuiasDespachoUrbano(req: AuthRequest, res: Response): Promise<void> {
  try {
    const siteId = parseAdminSiteId(req.query.site_id);
    const query = parseUrbanoDispatchQuery(req.query as Record<string, unknown>);
    const site = await findAuthorizedSite(req, siteId);

    if (!site) {
      res.status(404).json({ ok: false, message: 'La sede seleccionada no está disponible.' });
      return;
    }
    if (site.integration_status !== 'activo') {
      res.status(409).json({
        ok: false,
        message: 'La sede seleccionada no tiene una integración Urbano activa.',
      });
      return;
    }

    const data = await fetchDispatchGuides({
      userId: Number(req.user!.id),
      sedeId: siteId,
    }, query);

    res.json({
      ok: true,
      data: {
        ...data,
        site: { id: siteId, name: site.nombre },
      },
    });
  } catch (error) {
    if (error instanceof UrbanoDispatchValidationError) {
      res.status(400).json({ ok: false, message: error.message });
      return;
    }
    console.error('[urbano-despachos] Error al consultar CDP:', error);
    res.status(502).json({ ok: false, message: publicUrbanoDispatchErrorMessage(error) });
  }
}

export async function consultarDetalleGuiaUrbano(req: AuthRequest, res: Response): Promise<void> {
  try {
    const siteId = parseAdminSiteId(req.query.site_id);
    const guide = parseUrbanoGuide(req.query.guide);
    const site = await findAuthorizedSite(req, siteId);

    if (!site) {
      res.status(404).json({ ok: false, message: 'La sede seleccionada no está disponible.' });
      return;
    }
    if (site.integration_status !== 'activo') {
      res.status(409).json({
        ok: false,
        message: 'La sede seleccionada no tiene una integración Urbano activa.',
      });
      return;
    }

    const data = await fetchGuideDetails({
      userId: Number(req.user!.id),
      sedeId: siteId,
    }, guide);
    res.json({ ok: true, data });
  } catch (error) {
    if (error instanceof UrbanoDispatchValidationError) {
      res.status(400).json({ ok: false, message: error.message });
      return;
    }
    console.error('[urbano-despachos] Error al consultar detalle de guía:', error);
    res.status(502).json({ ok: false, message: publicUrbanoDispatchErrorMessage(error) });
  }
}
