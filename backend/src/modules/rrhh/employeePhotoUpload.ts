import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { EMPLOYEE_PHOTO_MAX_BYTES, EmployeePhotoError } from './services/EmployeePhotoStorageService';

const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const employeePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: EMPLOYEE_PHOTO_MAX_BYTES, fields: 0 },
  fileFilter: (_req, file, callback) => {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      return callback(new EmployeePhotoError(
        'UNSUPPORTED_EMPLOYEE_PHOTO',
        'Formato no permitido. Usa una imagen JPG, PNG o WebP.',
        415,
      ));
    }
    return callback(null, true);
  },
});

export function receiveEmployeePhoto(req: Request, res: Response, next: NextFunction) {
  employeePhotoUpload.single('photo')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof EmployeePhotoError) {
      return res.status(error.statusCode).json({ ok: false, code: error.code, message: error.message });
    }
    const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 422).json({
      ok: false,
      code: tooLarge ? 'EMPLOYEE_PHOTO_TOO_LARGE' : 'INVALID_EMPLOYEE_PHOTO_UPLOAD',
      message: tooLarge ? 'La foto supera el limite de 2 MB.' : 'No se pudo procesar la foto seleccionada.',
    });
  });
}
