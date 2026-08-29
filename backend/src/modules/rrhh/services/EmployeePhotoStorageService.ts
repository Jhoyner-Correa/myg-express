import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';

export const EMPLOYEE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const EMPLOYEE_PHOTO_PUBLIC_PREFIX = '/storage/rrhh/profile-photos/';
export const EMPLOYEE_PHOTO_ROOT = path.resolve(
  process.env.RRHH_PROFILE_PHOTO_DIR || path.join(process.cwd(), 'storage', 'rrhh', 'profile-photos'),
);

type SupportedPhoto = { extension: 'jpg' | 'png' | 'webp'; mimeType: string };

export class EmployeePhotoError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 422,
  ) {
    super(message);
    this.name = 'EmployeePhotoError';
  }
}

export function detectEmployeePhoto(buffer: Buffer): SupportedPhoto | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { extension: 'webp', mimeType: 'image/webp' };
  }
  return null;
}

export class EmployeePhotoStorageService {
  async save(buffer: Buffer, declaredMimeType: string): Promise<string> {
    if (!buffer.length) {
      throw new EmployeePhotoError('EMPTY_EMPLOYEE_PHOTO', 'La imagen seleccionada esta vacia.');
    }
    if (buffer.length > EMPLOYEE_PHOTO_MAX_BYTES) {
      throw new EmployeePhotoError('EMPLOYEE_PHOTO_TOO_LARGE', 'La foto supera el limite de 2 MB.', 413);
    }

    const detected = detectEmployeePhoto(buffer);
    if (!detected || detected.mimeType !== declaredMimeType) {
      throw new EmployeePhotoError(
        'INVALID_EMPLOYEE_PHOTO',
        'El archivo no es una imagen JPG, PNG o WebP valida.',
        415,
      );
    }

    await mkdir(EMPLOYEE_PHOTO_ROOT, { recursive: true });
    const filename = `${randomUUID()}.${detected.extension}`;
    await writeFile(path.join(EMPLOYEE_PHOTO_ROOT, filename), buffer, { flag: 'wx' });
    return `${EMPLOYEE_PHOTO_PUBLIC_PREFIX}${filename}`;
  }

  async removeManaged(photoUrl: string | null | undefined): Promise<boolean> {
    if (!photoUrl?.startsWith(EMPLOYEE_PHOTO_PUBLIC_PREFIX)) return false;
    const filename = photoUrl.slice(EMPLOYEE_PHOTO_PUBLIC_PREFIX.length);
    if (!/^[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(filename)) return false;

    const target = path.resolve(EMPLOYEE_PHOTO_ROOT, filename);
    if (path.dirname(target) !== EMPLOYEE_PHOTO_ROOT) return false;
    try {
      await unlink(target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}
