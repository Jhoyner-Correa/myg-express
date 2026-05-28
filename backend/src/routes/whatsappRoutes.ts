import { Router } from 'express';
import { sendWhatsAppMessage } from '../controllers/whatsappController';
import {
  cancelarPendientesLoteWhatsApp,
  enviarLoteWhatsApp,
  marcarLoteWhatsAppManual,
  reanudarLoteWhatsAppInterrumpido
} from '../controllers/whatsappLoteController';
import { recibirWebhookEvolution } from '../controllers/whatsappSesionesController';
import { verificarToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/send', verificarToken, sendWhatsAppMessage);
router.post('/enviar-lote', verificarToken, enviarLoteWhatsApp);
router.post('/lotes/:loteId/resume', verificarToken, reanudarLoteWhatsAppInterrumpido);
router.post('/lotes/:loteId/mark-manual', verificarToken, marcarLoteWhatsAppManual);
router.post('/lotes/:loteId/cancel-pending', verificarToken, cancelarPendientesLoteWhatsApp);

// Webhook para recibir notificaciones desde Evolution API (autenticado internamente mediante apiKey)
router.post('/webhook*', recibirWebhookEvolution);

export default router;
