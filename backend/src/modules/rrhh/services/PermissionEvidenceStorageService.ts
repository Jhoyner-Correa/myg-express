import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';

export const PERMISSION_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const PERMISSION_EVIDENCE_ROOT = path.resolve(
  process.env.RRHH_PERMISSION_EVIDENCE_DIR
    || path.join(process.cwd(), 'storage', 'rrhh', 'permission-evidence'),
);

type EvidenceType = { extension: 'jpg' | 'png' | 'pdf'; mimeType: string };

export class PermissionEvidenceError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 422) {
    super(message);
    this.name = 'PermissionEvidenceError';
  }
}

function detectEvidence(buffer: Buffer): EvidenceType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { extension: 'pdf', mimeType: 'application/pdf' };
  }
  return null;
}

export type StoredPermissionEvidence = {
  storageKey: string;
  mimeType: string;
  bytes: number;
  sha256: string;
};

export class PermissionEvidenceStorageService {
  async save(buffer: Buffer, declaredMimeType: string): Promise<StoredPermissionEvidence> {
    if (!buffer.length) throw new PermissionEvidenceError('EMPTY_EVIDENCE', 'El sustento seleccionado esta vacio.');
    if (buffer.length > PERMISSION_EVIDENCE_MAX_BYTES) {
      throw new PermissionEvidenceError('EVIDENCE_TOO_LARGE', 'El sustento supera el limite de 5 MB.', 413);
    }
    const detected = detectEvidence(buffer);
    if (!detected || detected.mimeType !== declaredMimeType) {
      throw new PermissionEvidenceError('INVALID_EVIDENCE', 'Adjunta una imagen JPG, PNG o un documento PDF valido.', 415);
    }
    await mkdir(PERMISSION_EVIDENCE_ROOT, { recursive: true });
    const storageKey = `${randomUUID()}.${detected.extension}`;
    await writeFile(path.join(PERMISSION_EVIDENCE_ROOT, storageKey), buffer, { flag: 'wx' });
    return {
      storageKey,
      mimeType: detected.mimeType,
      bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    if (!/^[0-9a-f-]+\.(?:jpg|png|pdf)$/i.test(storageKey)) {
      throw new PermissionEvidenceError('INVALID_EVIDENCE_KEY', 'El sustento solicitado no es valido.', 404);
    }
    const target = path.resolve(PERMISSION_EVIDENCE_ROOT, storageKey);
    if (path.dirname(target) !== PERMISSION_EVIDENCE_ROOT) {
      throw new PermissionEvidenceError('INVALID_EVIDENCE_KEY', 'El sustento solicitado no es valido.', 404);
    }
    try {
      return await readFile(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new PermissionEvidenceError('EVIDENCE_NOT_FOUND', 'El sustento ya no esta disponible.', 404);
      }
      throw error;
    }
  }

  async remove(storageKey: string): Promise<void> {
    if (!/^[0-9a-f-]+\.(?:jpg|png|pdf)$/i.test(storageKey)) return;
    const target = path.resolve(PERMISSION_EVIDENCE_ROOT, storageKey);
    if (path.dirname(target) !== PERMISSION_EVIDENCE_ROOT) return;
    try { await unlink(target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
