import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';

export const OVERTIME_EVIDENCE_MAX_BYTES = 3 * 1024 * 1024;
export const OVERTIME_EVIDENCE_ROOT = path.resolve(
  process.env.RRHH_OVERTIME_EVIDENCE_DIR
    || path.join(process.cwd(), 'storage', 'rrhh', 'overtime-evidence'),
);

type EvidenceType = { extension: 'jpg' | 'png'; mimeType: string };

export class OvertimeEvidenceError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 422) {
    super(message);
    this.name = 'OvertimeEvidenceError';
  }
}

function detectImage(buffer: Buffer): EvidenceType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  return null;
}

export type StoredOvertimeEvidence = {
  storageKey: string;
  mimeType: string;
  bytes: number;
  sha256: string;
};

export class OvertimeEvidenceStorageService {
  async save(buffer: Buffer, declaredMimeType: string): Promise<StoredOvertimeEvidence> {
    if (!buffer.length) throw new OvertimeEvidenceError('EMPTY_OVERTIME_EVIDENCE', 'La foto seleccionada esta vacia.');
    if (buffer.length > OVERTIME_EVIDENCE_MAX_BYTES) {
      throw new OvertimeEvidenceError('OVERTIME_EVIDENCE_TOO_LARGE', 'La foto supera el limite de 3 MB.', 413);
    }
    const detected = detectImage(buffer);
    if (!detected || detected.mimeType !== declaredMimeType) {
      throw new OvertimeEvidenceError('INVALID_OVERTIME_EVIDENCE', 'Adjunta una foto JPG o PNG valida.', 415);
    }
    await mkdir(OVERTIME_EVIDENCE_ROOT, { recursive: true });
    const storageKey = `${randomUUID()}.${detected.extension}`;
    await writeFile(path.join(OVERTIME_EVIDENCE_ROOT, storageKey), buffer, { flag: 'wx' });
    return { storageKey, mimeType: detected.mimeType, bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex') };
  }

  async read(storageKey: string): Promise<Buffer> {
    if (!/^[0-9a-f-]+\.(?:jpg|png)$/i.test(storageKey)) {
      throw new OvertimeEvidenceError('INVALID_OVERTIME_EVIDENCE_KEY', 'El sustento solicitado no es valido.', 404);
    }
    const target = path.resolve(OVERTIME_EVIDENCE_ROOT, storageKey);
    if (path.dirname(target) !== OVERTIME_EVIDENCE_ROOT) {
      throw new OvertimeEvidenceError('INVALID_OVERTIME_EVIDENCE_KEY', 'El sustento solicitado no es valido.', 404);
    }
    try { return await readFile(target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new OvertimeEvidenceError('OVERTIME_EVIDENCE_NOT_FOUND', 'El sustento ya no esta disponible.', 404);
      }
      throw error;
    }
  }

  async remove(storageKey: string): Promise<void> {
    if (!/^[0-9a-f-]+\.(?:jpg|png)$/i.test(storageKey)) return;
    const target = path.resolve(OVERTIME_EVIDENCE_ROOT, storageKey);
    if (path.dirname(target) !== OVERTIME_EVIDENCE_ROOT) return;
    try { await unlink(target); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
