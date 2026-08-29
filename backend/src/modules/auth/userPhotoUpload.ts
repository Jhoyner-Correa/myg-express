import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { USER_PHOTO_MAX_BYTES, UserPhotoError } from './services/UserPhotoStorageService';

const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: USER_PHOTO_MAX_BYTES, fields: 0 },
  fileFilter: (_req, file, callback) => acceptedMimeTypes.has(file.mimetype)
    ? callback(null, true)
    : callback(new UserPhotoError('UNSUPPORTED_USER_PHOTO', 'Formato no permitido. Usa JPG, PNG o WebP.', 415)),
});

export function receiveUserPhoto(req: Request, res: Response, next: NextFunction) {
  upload.single('photo')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof UserPhotoError) {
      return res.status(error.statusCode).json({ ok: false, code: error.code, message: error.message });
    }
    const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 422).json({
      ok: false,
      code: tooLarge ? 'USER_PHOTO_TOO_LARGE' : 'INVALID_USER_PHOTO_UPLOAD',
      message: tooLarge ? 'La foto supera el limite de 2 MB.' : 'No se pudo procesar la foto seleccionada.',
    });
  });
}
