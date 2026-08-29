import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { PRIVATE_SELFIE_ROOT } from '../rrhh/services/AttendanceEvidenceRetentionService';

fs.mkdirSync(PRIVATE_SELFIE_ROOT, { recursive: true });

export const selfieUpload = multer({
  storage: multer.diskStorage({
    destination: PRIVATE_SELFIE_ROOT,
    filename: (_req, _file, callback) => callback(null, `${randomUUID()}.jpg`),
  }),
  limits: { files: 1, fileSize: 1_500_000, fields: 12, fieldSize: 8_192 },
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype === 'image/jpeg');
  },
});
