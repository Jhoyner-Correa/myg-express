import { Router } from 'express';
import { sendWhatsAppMessage } from '../controllers/whatsappController';
import {
  cancelarPendientesLoteWhatsApp,
  enviarLoteWhatsApp,
  marcarLoteWhatsAppManual,
  pausarLoteWhatsApp,
  reanudarLoteWhatsAppInterrumpido
} from '../controllers/whatsappLoteController';
import { recibirWebhookEvolution } from '../controllers/whatsappSesionesController';
import { PERMISSIONS } from '../../../core/constants/permissions';
import { verificarToken } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';

const router = Router();

// Webhook para recibir notificaciones desde Evolution API (autenticado internamente mediante apiKey)
router.post('/webhook*', recibirWebhookEvolution);

router.use(verificarToken, requirePermission(PERMISSIONS.WHATSAPP_MANAGE));

router.post('/send', sendWhatsAppMessage);
router.post('/enviar-lote', enviarLoteWhatsApp);
router.post('/lotes/:loteId/pause', pausarLoteWhatsApp);
router.post('/lotes/:loteId/resume', reanudarLoteWhatsAppInterrumpido);
router.post('/lotes/:loteId/mark-manual', marcarLoteWhatsAppManual);
router.post('/lotes/:loteId/cancel-pending', cancelarPendientesLoteWhatsApp);

export default router;
