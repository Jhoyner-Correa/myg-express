import { Router } from 'express';
import multer from 'multer';
import {
  subirYProcesarPdf,
  listarLotesJnt,
  obtenerDetalleLoteJnt,
  renombrarLoteJnt,
  eliminarLoteJnt,
  listarRutasDisponiblesJnt,
  crearLoteWhatsAppDesdeJnt
} from '../controllers/jntController';
import { verificarToken } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/permissionMiddleware';
import { PERMISSIONS } from '../../../core/constants/permissions';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos en formato PDF'));
    }
  }
});

const router = Router();

router.use(verificarToken);

router.post(
  '/upload-pdf',
  requirePermission(PERMISSIONS.JNT_MANAGE),
  upload.single('pdf'),
  subirYProcesarPdf
);

router.get(
  '/lotes',
  requirePermission(PERMISSIONS.JNT_VIEW),
  listarLotesJnt
);

router.get(
  '/rutas-disponibles',
  requirePermission(PERMISSIONS.JNT_VIEW),
  listarRutasDisponiblesJnt
);

router.get(
  '/lotes/:id',
  requirePermission(PERMISSIONS.JNT_VIEW),
  obtenerDetalleLoteJnt
);

router.patch(
  '/lotes/:id',
  requirePermission(PERMISSIONS.JNT_MANAGE),
  renombrarLoteJnt
);

router.delete(
  '/lotes/:id',
  requirePermission(PERMISSIONS.JNT_MANAGE),
  eliminarLoteJnt
);

router.post(
  '/crear-lote-whatsapp',
  requirePermission(PERMISSIONS.JNT_MANAGE),
  crearLoteWhatsAppDesdeJnt
);

export default router;
