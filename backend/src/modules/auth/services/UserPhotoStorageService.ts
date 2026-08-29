import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';

export const USER_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const USER_PHOTO_PUBLIC_PREFIX = '/storage/users/profile-photos/';
const USER_PHOTO_ROOT = path.resolve(
  process.env.USER_PROFILE_PHOTO_DIR || path.join(process.cwd(), 'storage', 'users', 'profile-photos'),
);

type SupportedPhoto = { extension: 'jpg' | 'png' | 'webp'; mimeType: string };

export class UserPhotoError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 422) {
    super(message);
    this.name = 'UserPhotoError';
  }
}

export function detectUserPhoto(buffer: Buffer): SupportedPhoto | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: 'webp', mimeType: 'image/webp' };
  }
  return null;
}

export class UserPhotoStorageService {
  async save(buffer: Buffer, declaredMimeType: string): Promise<string> {
    if (!buffer.length) throw new UserPhotoError('EMPTY_USER_PHOTO', 'La imagen seleccionada esta vacia.');
    if (buffer.length > USER_PHOTO_MAX_BYTES) throw new UserPhotoError('USER_PHOTO_TOO_LARGE', 'La foto supera el limite de 2 MB.', 413);
    const detected = detectUserPhoto(buffer);
    if (!detected || detected.mimeType !== declaredMimeType) {
      throw new UserPhotoError('INVALID_USER_PHOTO', 'El archivo no es una imagen JPG, PNG o WebP valida.', 415);
    }
    await mkdir(USER_PHOTO_ROOT, { recursive: true });
    const filename = `${randomUUID()}.${detected.extension}`;
    await writeFile(path.join(USER_PHOTO_ROOT, filename), buffer, { flag: 'wx' });
    return `${USER_PHOTO_PUBLIC_PREFIX}${filename}`;
  }

  async removeManaged(photoUrl: string | null | undefined): Promise<boolean> {
    if (!photoUrl?.startsWith(USER_PHOTO_PUBLIC_PREFIX)) return false;
    const filename = photoUrl.slice(USER_PHOTO_PUBLIC_PREFIX.length);
    if (!/^[0-9a-f-]+\.(?:jpg|png|webp)$/i.test(filename)) return false;
    const target = path.resolve(USER_PHOTO_ROOT, filename);
    if (path.dirname(target) !== USER_PHOTO_ROOT) return false;
    try {
      await unlink(target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}
