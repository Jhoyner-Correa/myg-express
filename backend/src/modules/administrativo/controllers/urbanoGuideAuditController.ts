import { Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../../../core/database/database';
import { AuthRequest } from '../../../core/middlewares/authMiddleware';
import {
  parseGuideAuditText,
  UrbanoGuideAuditValidationError,
} from '../domain/urbanoGuideAuditDomain';
import { parseAdminSiteId } from '../domain/urbanoDispatchDomain';
import { executeWybGuidesAudit } from '../services/urbanoGuideAuditService';

type SiteAuthRow = RowDataPacket & {
  id: number;
  nombre: string;
  integration_status: 'activo' | 'inactivo' | null;
};

async function findAuthorizedSiteForAudit(req: AuthRequest, siteId: number): Promise<SiteAuthRow | null> {
  const companyId = req.user?.empresa_id ?? null;
  const [rows] = await pool.query<SiteAuthRow[]>(
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

export async function auditarGuiasUrbano(req: AuthRequest, res: Response): Promise<void> {
  try {
    const siteId = parseAdminSiteId(req.body.site_id);
    const site = await findAuthorizedSiteForAudit(req, siteId);

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

    const rawInput = req.body.text || (Array.isArray(req.body.guides) ? req.body.guides.join('\n') : '');
    const rows = parseGuideAuditText(rawInput);

    const data = await executeWybGuidesAudit({
      userId: Number(req.user!.id),
      sedeId: siteId,
      siteName: site.nombre,
      rows,
    });

    res.json({ ok: true, data });
  } catch (error: any) {
    if (error instanceof UrbanoGuideAuditValidationError) {
      res.status(400).json({ ok: false, message: error.message });
      return;
    }
    console.error('[urbano-auditoria] Error al auditar guías:', error);
    res.status(500).json({ ok: false, message: error?.message || 'Error al procesar la auditoría de guías en Urbano.' });
  }
}
