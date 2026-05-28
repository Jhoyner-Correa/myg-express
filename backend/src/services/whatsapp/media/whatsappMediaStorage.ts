import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * PersistedMedia
 *
 * mediaPath         → Ruta RELATIVA al proyecto (lo que se persiste en la BD).
 *                     Ejemplo: "storage/whatsapp-media/plantillas/uuid-img.jpg"
 *                     Portable entre máquinas y entre entornos.
 *
 * mediaAbsolutePath → Ruta ABSOLUTA en disco (para uso inmediato con fs/WhatsApp).
 *                     Nunca se guarda en BD.
 *
 * mediaMimeType     → Tipo MIME detectado del archivo.
 * mediaFilename     → Nombre limpio del archivo original.
 */
type PersistedMedia = {
  mediaPath: string;
  mediaAbsolutePath: string;
  mediaMimeType: string;
  mediaFilename: string;
};

/**
 * WhatsAppMediaStorage
 *
 * Servicio responsable de persistir imágenes en disco de forma profesional.
 *
 * Estrategia de rutas:
 * ─────────────────────────────────────────────────────────────────────────
 * ✅ Se usa process.cwd() (no __dirname) para calcular el directorio base.
 *    process.cwd() = backend/ sin importar si el código está en src/ o dist/.
 *
 * ✅ Las imágenes se guardan en:
 *    backend/storage/whatsapp-media/<subfolder>/<uuid>-<nombre>.ext
 *
 *    La carpeta storage/ está fuera de src/ y dist/, por lo tanto:
 *    - No se borra al compilar TypeScript (npm run build).
 *    - No se incluye accidentalmente en el repositorio Git.
 *    - Persiste entre deploys si se hace correctamente.
 *
 * ✅ La BD almacena rutas RELATIVAS (ej: storage/whatsapp-media/plantillas/uuid.jpg).
 *    Nunca rutas absolutas que contengan la ruta del equipo local.
 *
 * ✅ Al cambiar imagen de una plantilla, la imagen anterior se borra
 *    desde el controller (borrarImagenDisco) — cero acumulación de espacio.
 *
 * ✅ Soporta rutas absolutas legadas (backward compatibility) mediante
 *    resolveAbsolutePath(), que detecta si la ruta ya es absoluta.
 * ─────────────────────────────────────────────────────────────────────────
 */
class WhatsAppMediaStorage {
  // Directorio base: backend/storage/whatsapp-media/
  // process.cwd() siempre apunta a backend/ cuando se inicia con npm run dev|start
  private readonly baseDir = path.resolve(process.cwd(), 'storage', 'whatsapp-media');

  // ─── Helpers privados ──────────────────────────────────────────────────────

  private sanitizeFilename(filename: string): string {
    return String(filename || '').trim().replace(/[^\w.\-]/g, '_') || 'archivo';
  }

  private extensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg':      '.jpg',
      'image/png':       '.png',
      'image/webp':      '.webp',
      'image/gif':       '.gif',
      'application/pdf': '.pdf'
    };
    return map[mimeType] || '';
  }

  private parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } {
    const match = String(dataUrl || '').match(/^data:(.+);base64,(.+)$/);
    if (!match) {
      throw new Error('Formato de imagen no válido. Se esperaba un Data URL en base64 (data:image/...;base64,...).');
    }
    return { mimeType: match[1], base64Data: match[2] };
  }

  // ─── API pública ───────────────────────────────────────────────────────────

  /**
   * Devuelve el tipo MIME a partir de la extensión de un archivo.
   */
  mimeTypeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png':  'image/png',
      '.webp': 'image/webp',
      '.gif':  'image/gif',
      '.pdf':  'application/pdf'
    };
    return map[ext] || 'application/octet-stream';
  }

  /**
   * Resuelve la ruta guardada en BD a su ruta absoluta en disco.
   *
   * Soporta dos formatos para compatibilidad:
   * - Ruta relativa nueva:  "storage/whatsapp-media/plantillas/uuid.jpg" → resuelve con process.cwd()
   * - Ruta absoluta legada: "C:\Users\..." → la retorna tal cual (sin modificar)
   */
  resolveAbsolutePath(storedPath: string): string {
    if (path.isAbsolute(storedPath)) {
      return storedPath; // backward compatibility con registros anteriores
    }
    return path.resolve(process.cwd(), storedPath);
  }

  /**
   * Persiste una imagen en base64 en disco y retorna sus metadatos.
   *
   * @param dataUrl         Data URL completo (ej: "data:image/jpeg;base64,...")
   * @param originalFilename Nombre original del archivo (para preservar extensión)
   * @param subfolder       Subcarpeta dentro de whatsapp-media (ej: "plantillas")
   */
  async persistBase64Media(
    dataUrl: string,
    originalFilename?: string | null,
    subfolder?: string
  ): Promise<PersistedMedia> {
    const { mimeType, base64Data } = this.parseDataUrl(dataUrl);

    const safeFilename = this.sanitizeFilename(originalFilename || 'archivo');
    const parsedName   = path.parse(safeFilename);
    const ext          = parsedName.ext || this.extensionFromMimeType(mimeType);
    const finalFilename = `${parsedName.name || 'archivo'}${ext}`;

    const bucket    = subfolder || new Date().toISOString().slice(0, 10);
    const directory = path.join(this.baseDir, bucket);
    const absPath   = path.join(directory, `${randomUUID()}-${finalFilename}`);

    // Crear carpeta si no existe y escribir el archivo
    await mkdir(directory, { recursive: true });
    await writeFile(absPath, Buffer.from(base64Data, 'base64'));

    // Ruta relativa con separadores "/" (funciona en Windows y Linux/VPS)
    const relPath = path.relative(process.cwd(), absPath).replace(/\\/g, '/');

    return {
      mediaPath:         relPath,   // ← esto se guarda en BD
      mediaAbsolutePath: absPath,   // ← esto se usa para leer en disco
      mediaMimeType:     mimeType,
      mediaFilename:     finalFilename
    };
  }
}

export default new WhatsAppMediaStorage();
