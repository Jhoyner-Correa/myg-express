import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import {
  PERMISSION_EVIDENCE_MAX_BYTES,
  PermissionEvidenceError,
} from '../rrhh/services/PermissionEvidenceStorageService';

const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: PERMISSION_EVIDENCE_MAX_BYTES, fields: 8 },
  fileFilter: (_req, file, callback) => {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      return callback(new PermissionEvidenceError(
        'UNSUPPORTED_EVIDENCE',
        'Formato no permitido. Usa JPG, PNG o PDF.',
        415,
      ));
    }
    return callback(null, true);
  },
});

export function receivePermissionEvidence(req: Request, res: Response, next: NextFunction) {
  upload.single('evidence')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof PermissionEvidenceError) {
      return res.status(error.statusCode).json({ ok: false, code: error.code, message: error.message });
    }
    const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 422).json({
      ok: false,
      code: tooLarge ? 'EVIDENCE_TOO_LARGE' : 'INVALID_EVIDENCE_UPLOAD',
      message: tooLarge ? 'El sustento supera el limite de 5 MB.' : 'No se pudo procesar el sustento.',
    });
  });
}
