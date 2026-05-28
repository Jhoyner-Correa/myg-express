import { IWhatsAppProvider } from './IWhatsAppProvider';
import { readFile } from 'fs/promises';
import path from 'path';

/**
 * EvolutionApiProvider
 *
 * Implementación de IWhatsAppProvider para integrarse con Evolution API.
 *
 * Ventajas:
 * - No requiere Puppeteer/Chromium local (menor uso de RAM y CPU).
 * - Basado en la biblioteca Baileys.
 * - Soporta Webhooks para sincronización en tiempo real.
 */
export class EvolutionApiProvider implements IWhatsAppProvider {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly webhookUrl: string;

  constructor() {
    this.apiUrl = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
    this.apiKey = process.env.EVOLUTION_API_APIKEY || '';
    this.webhookUrl = process.env.EVOLUTION_API_WEBHOOK_URL || '';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'apikey': this.apiKey
    };
  }

  /**
   * Realiza un fetch manejando de forma robusta los errores de conexión si el microservicio está apagado.
   */
  private async safeFetch(url: string, options: RequestInit): Promise<Response> {
    try {
      return await fetch(url, options);
    } catch (error: any) {
      console.error(`[Evolution API Connection Error] URL: ${url}. Detalle:`, error.message);
      throw new Error('No se pudo conectar con el servidor de Evolution API. Asegúrate de que el microservicio esté encendido y configurado en la dirección correcta.');
    }
  }

  private mapState(state: string | null | undefined): string {
    const s = String(state || '').toLowerCase();
    if (s === 'open' || s === 'connected') return 'connected';
    if (s === 'connecting') return 'initializing';
    return 'disconnected';
  }

  private cleanPhoneNumber(to: string): string {
    const raw = String(to || '').trim();
    const withoutSuffix = raw.replace(/@c\.us$/i, '');
    const digits = withoutSuffix.replace(/[^\d]/g, '');

    if (!digits) {
      return raw;
    }

    // Si viene un número celular local peruano (9 dígitos), normalizar con prefijo 51
    if (digits.length === 9) {
      return `51${digits}`;
    }

    // Si viene con un cero adelante (10 dígitos), asumimos celular local peruano y corregimos
    if (digits.length === 10 && digits.startsWith('0')) {
      return `51${digits.slice(1)}`;
    }

    return digits;
  }

  /**
   * Inicializa la instancia en Evolution API si no existe.
   */
  async init(sessionKey: string): Promise<void> {
    try {
      console.log(`[Evolution API] Inicializando instancia "${sessionKey}"...`);

      // 1. Verificar si la instancia existe
      const statusRes = await this.safeFetch(`${this.apiUrl}/instance/connectionState/${sessionKey}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (statusRes.ok) {
        console.log(`[Evolution API] La instancia "${sessionKey}" ya existe.`);
        // Asegurar que el webhook esté configurado
        await this.setupWebhook(sessionKey);
        return;
      }

      // 2. Si no existe, crear la instancia
      console.log(`[Evolution API] Creando nueva instancia "${sessionKey}"...`);
      const createRes = await this.safeFetch(`${this.apiUrl}/instance/create`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          instanceName: sessionKey,
          token: this.apiKey,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          webhook: this.webhookUrl ? {
            enabled: true,
            url: this.webhookUrl,
            byEvents: true,
            events: ['CONNECTION_UPDATE']
          } : undefined
        })
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Error de creación de instancia (${createRes.status}): ${errText}`);
      }

      console.log(`[Evolution API] Instancia "${sessionKey}" creada correctamente.`);
    } catch (error: any) {
      console.error(`[Evolution API] Error en init para "${sessionKey}":`, error.message);
      throw error;
    }
  }

  private async setupWebhook(sessionKey: string): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      const res = await this.safeFetch(`${this.apiUrl}/webhook/set/${sessionKey}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          webhook: {
            enabled: true,
            url: this.webhookUrl,
            byEvents: true,
            events: ['CONNECTION_UPDATE']
          }
        })
      });

      if (!res.ok) {
        console.warn(`[Evolution API] No se pudo configurar el webhook para "${sessionKey}" (${res.status})`);
      }
    } catch (error: any) {
      console.error(`[Evolution API] Error configurando webhook para "${sessionKey}":`, error.message);
    }
  }

  /**
   * Obtiene el estado en tiempo real.
   */
  async getStatus(sessionKey: string): Promise<string> {
    try {
      const res = await this.safeFetch(`${this.apiUrl}/instance/connectionState/${sessionKey}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!res.ok) {
        return 'disconnected';
      }

      const data: any = await res.json();
      const state = data?.instance?.state || data?.instance?.status;
      return this.mapState(state);
    } catch (error) {
      return 'disconnected';
    }
  }

  async resolveStatus(sessionKey: string, persistedStatus?: string | null): Promise<string> {
    return this.getStatus(sessionKey);
  }

  async isConnected(sessionKey: string): Promise<boolean> {
    const status = await this.getStatus(sessionKey);
    return status === 'connected';
  }

  /**
   * Obtiene el código QR de conexión en base64 para pintar en la UI.
   */
  async getQr(sessionKey: string): Promise<string | null> {
    try {
      await this.init(sessionKey);
      console.log(`[Evolution API] Solicitando QR para "${sessionKey}"...`);
      const res = await this.safeFetch(`${this.apiUrl}/instance/connect/${sessionKey}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!res.ok) {
        console.warn(`[Evolution API] No se pudo obtener QR. Estado HTTP: ${res.status}`);
        return null;
      }

      const data: any = await res.json();
      const base64 = data?.base64 || data?.qrcode?.base64 || null;
      return base64;
    } catch (error: any) {
      console.error(`[Evolution API] Error obteniendo QR para "${sessionKey}":`, error.message);
      return null;
    }
  }

  /**
   * Envía un mensaje de texto o imagen a través del microservicio.
   */
  async sendMessage(
    sessionKey: string,
    to: string,
    message: string,
    mediaPath?: string | null,
    mediaMimeType?: string | null,
    mediaFilename?: string | null
  ): Promise<any> {
    const cleanNumber = this.cleanPhoneNumber(to);
    
    if (!cleanNumber) {
      throw new Error('Número de teléfono inválido');
    }

    try {
      // 1. Envío con archivo multimedia adjunto
      if (mediaPath) {
        console.log(`[Evolution API] Enviando mensaje con imagen a ${cleanNumber}...`);
        const fileBuffer = await readFile(mediaPath);
        const fileBase64 = fileBuffer.toString('base64');
        const mediatype = (mediaMimeType || '').startsWith('image') ? 'image' : 'document';

        const payload = {
          number: cleanNumber,
          mediatype: mediatype,
          mimetype: mediaMimeType || 'image/jpeg',
          caption: message || '',
          media: fileBase64,
          fileName: mediaFilename || path.basename(mediaPath)
        };

        const res = await this.safeFetch(`${this.apiUrl}/message/sendMedia/${sessionKey}`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Fallo en sendMedia (${res.status}): ${errText}`);
        }

        const data: any = await res.json();
        return data;
      }

      // 2. Envío de solo texto
      console.log(`[Evolution API] Enviando mensaje de texto a ${cleanNumber}...`);
      const payload = {
        number: cleanNumber,
        text: message
      };

      const res = await this.safeFetch(`${this.apiUrl}/message/sendText/${sessionKey}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Fallo en sendText (${res.status}): ${errText}`);
      }

      const data: any = await res.json();
      return data;
    } catch (error: any) {
      console.error(`[Evolution API] Errorizando envío de mensaje a ${cleanNumber} vía "${sessionKey}":`, error.message);
      throw error;
    }
  }

  /**
   * Reinicia la instancia.
   */
  async reconnect(sessionKey: string): Promise<void> {
    try {
      await this.init(sessionKey);
      console.log(`[Evolution API] Reiniciando instancia "${sessionKey}"...`);
      const res = await this.safeFetch(`${this.apiUrl}/instance/restart/${sessionKey}`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Fallo al reiniciar (${res.status}): ${errText}`);
      }
    } catch (error: any) {
      console.error(`[Evolution API] Error reiniciando "${sessionKey}":`, error.message);
      throw error;
    }
  }

  /**
   * Cierra la sesión activa en el teléfono.
   */
  async logout(sessionKey: string): Promise<void> {
    try {
      console.log(`[Evolution API] Cerrando sesión para "${sessionKey}"...`);
      const res = await this.safeFetch(`${this.apiUrl}/instance/logout/${sessionKey}`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      if (!res.ok) {
        console.warn(`[Evolution API] Fallo al cerrar sesión (${res.status})`);
      }
    } catch (error: any) {
      console.error(`[Evolution API] Error en logout para "${sessionKey}":`, error.message);
    }
  }

  /**
   * Elimina por completo la instancia de Evolution API.
   */
  async removeSessionData(sessionKey: string): Promise<void> {
    try {
      console.log(`[Evolution API] Eliminando instancia "${sessionKey}"...`);
      const res = await this.safeFetch(`${this.apiUrl}/instance/delete/${sessionKey}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      if (!res.ok) {
        console.warn(`[Evolution API] Fallo al eliminar instancia (${res.status})`);
      }
    } catch (error: any) {
      console.error(`[Evolution API] Error al eliminar "${sessionKey}":`, error.message);
    }
  }

  async bootstrapActiveSessions(): Promise<void> {
    // Evolution API persiste y rehidrata sus instancias automáticamente.
    return Promise.resolve();
  }

  async cleanupStaleAuthData(retentionDays: number): Promise<number> {
    // La limpieza de archivos de sesión se maneja en el microservicio Evolution API.
    return Promise.resolve(0);
  }
}
