import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { OVERTIME_EVIDENCE_MAX_BYTES, OvertimeEvidenceError } from '../rrhh/services/OvertimeEvidenceStorageService';

const accepted = new Set(['image/jpeg', 'image/png']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: OVERTIME_EVIDENCE_MAX_BYTES, fields: 6 },
  fileFilter: (_req, file, callback) => accepted.has(file.mimetype)
    ? callback(null, true)
    : callback(new OvertimeEvidenceError('INVALID_OVERTIME_EVIDENCE', 'Adjunta una foto JPG o PNG.', 415)),
});

export function receiveOvertimeEvidence(req: Request, res: Response, next: NextFunction) {
  upload.single('evidence')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof OvertimeEvidenceError) {
      return res.status(error.statusCode).json({ ok: false, code: error.code, message: error.message });
    }
    const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 422).json({
      ok: false,
      code: tooLarge ? 'OVERTIME_EVIDENCE_TOO_LARGE' : 'INVALID_OVERTIME_EVIDENCE_UPLOAD',
      message: tooLarge ? 'La foto supera el limite de 3 MB.' : 'No se pudo procesar la foto.',
    });
  });
}
