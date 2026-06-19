import { IWhatsAppProvider, WhatsAppProviderInstance } from './IWhatsAppProvider';
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
  private readonly statusGraceMs: number;
  private readonly qrCacheMs: number;
  private readonly lastConnectedAt = new Map<string, number>();
  private readonly qrCache = new Map<string, { qr: string | null; expiresAt: number }>();
  private readonly qrInflight = new Map<string, Promise<string | null>>();
  private readonly mediaBase64Cache = new Map<string, string>();

  constructor() {
    this.apiUrl = (process.env.EVOLUTION_API_URL || 'http://localhost:8080').replace(/\/$/, '');
    this.apiKey = process.env.EVOLUTION_API_APIKEY || '';
    this.webhookUrl = process.env.EVOLUTION_API_WEBHOOK_URL || '';
    this.statusGraceMs = this.readMs('EVOLUTION_STATUS_GRACE_MS', 15000);
    this.qrCacheMs = this.readMs('EVOLUTION_QR_CACHE_MS', 55000);
  }

  private readMs(name: string, fallback: number): number {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
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

  private findQrPayload(data: any): string | null {
    const candidates = [
      data?.base64,
      data?.code,
      data?.pairingCode,
      data?.qr,
      data?.qr?.base64,
      data?.qr?.code,
      data?.qr?.pairingCode,
      data?.qrcode,
      data?.qrcode?.base64,
      data?.qrcode?.code,
      data?.qrcode?.pairingCode,
      data?.instance?.qrcode,
      data?.instance?.qrcode?.base64,
      data?.instance?.qrcode?.code,
      data?.instance?.qr,
      data?.instance?.qr?.base64,
      data?.instance?.qr?.code
    ];

    for (const candidate of candidates) {
      const value = this.normalizeQrCandidate(candidate);
      if (value) return value;
    }

    return this.findQrPayloadDeep(data);
  }

  private normalizeQrCandidate(candidate: any): string | null {
    if (typeof candidate !== 'string') return null;
    const value = candidate.trim();
    if (!value) return null;
    return value;
  }

  private findQrPayloadDeep(value: any, depth = 0): string | null {
    if (!value || typeof value !== 'object' || depth > 4) return null;

    const qrKeys = new Set(['base64', 'code', 'pairingCode', 'qrcode', 'qr']);
    for (const [key, child] of Object.entries(value)) {
      if (qrKeys.has(key)) {
        const direct = this.normalizeQrCandidate(child);
        if (direct) return direct;
      }

      if (child && typeof child === 'object') {
        const nested = this.findQrPayloadDeep(child, depth + 1);
        if (nested) return nested;
      }
    }

    return null;
  }

  private summarizeObjectShape(value: any): string {
    if (!value || typeof value !== 'object') return typeof value;
    return Object.keys(value)
      .slice(0, 12)
      .map((key) => {
        const child = value[key];
        if (child && typeof child === 'object' && !Array.isArray(child)) {
          return `${key}{${Object.keys(child).slice(0, 8).join(',')}}`;
        }
        return key;
      })
      .join(', ');
  }

  private mapState(state: string | null | undefined): string {
    const s = String(state || '').toLowerCase();
    if (s === 'open' || s === 'connected') return 'connected';
    if (s === 'connecting') return 'initializing';
    return 'disconnected';
  }

  private isConnectedState(state: unknown): boolean {
    const normalized = String(state || '').trim().toLowerCase();
    return normalized === 'open' || normalized === 'connected';
  }

  private isInsideConnectedGrace(sessionKey: string): boolean {
    const last = this.lastConnectedAt.get(sessionKey) || 0;
    return last > 0 && Date.now() - last <= this.statusGraceMs;
  }

  private stabilizeStatus(sessionKey: string, mappedStatus: string, persistedStatus?: string | null): string {
    const persisted = String(persistedStatus || '').toLowerCase();

    if (mappedStatus === 'connected') {
      this.lastConnectedAt.set(sessionKey, Date.now());
      return 'connected';
    }

    if (mappedStatus === 'initializing') {
      if (persisted === 'connected' || this.isInsideConnectedGrace(sessionKey)) {
        return 'connected';
      }
      return 'initializing';
    }

    if (mappedStatus === 'disconnected' && this.isInsideConnectedGrace(sessionKey)) {
      return 'connected';
    }

    return mappedStatus;
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

  private async getMediaBase64(mediaPath: string): Promise<string> {
    const cached = this.mediaBase64Cache.get(mediaPath);
    if (cached) return cached;

    const fileBuffer = await readFile(mediaPath);
    const fileBase64 = fileBuffer.toString('base64');
    this.mediaBase64Cache.set(mediaPath, fileBase64);
    return fileBase64;
  }

  private buildInstancePayload(sessionKey: string): Record<string, any> {
    return {
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
    };
  }

  private async createInstance(sessionKey: string): Promise<any> {
    console.log(`[Evolution API] Creando nueva instancia "${sessionKey}"...`);
    const createRes = await this.safeFetch(`${this.apiUrl}/instance/create`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(this.buildInstancePayload(sessionKey))
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Error de creacion de instancia (${createRes.status}): ${errText}`);
    }

    const contentType = createRes.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await createRes.json() : null;
    console.log(`[Evolution API] Instancia "${sessionKey}" creada correctamente.`);
    return data;
  }

  private async deleteInstanceIfExists(sessionKey: string): Promise<void> {
    const res = await this.safeFetch(`${this.apiUrl}/instance/delete/${sessionKey}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });

    if (res.ok || res.status === 404) {
      return;
    }

    const errText = await res.text();
    throw new Error(`No se pudo limpiar instancia (${res.status}): ${errText}`);
  }

  private isCountOnlyQrResponse(data: any): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    const keys = Object.keys(data);
    return keys.length === 1 && keys[0] === 'count';
  }

  private async getRawConnectionState(sessionKey: string): Promise<string | null> {
    const res = await this.safeFetch(`${this.apiUrl}/instance/connectionState/${sessionKey}`, {
      method: 'GET',
      headers: this.getHeaders()
    });

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json();
    const state = data?.instance?.state || data?.instance?.status || data?.state || data?.status;
    return state ? String(state).trim() : null;
  }

  private async recoverQrFromStuckInstance(sessionKey: string): Promise<string | null> {
    console.warn(`[Evolution API] La instancia "${sessionKey}" no entrego QR. Se revisara el estado antes de recrearla.`);

    try {
      const currentState = await this.getRawConnectionState(sessionKey);
      if (this.isConnectedState(currentState)) {
        console.warn(`[Evolution API] La instancia "${sessionKey}" ya esta conectada (${currentState}). No se recreara.`);
        return null;
      }

      console.warn(`[Evolution API] Instancia "${sessionKey}" sin QR y estado "${currentState || 'desconocido'}". Se recreara para liberar el QR.`);
      await this.deleteInstanceIfExists(sessionKey);
      const createData = await this.createInstance(sessionKey);
      const createQr = this.findQrPayload(createData);
      if (createQr) return createQr;

      await new Promise((resolve) => setTimeout(resolve, 1500));
      const connectRes = await this.safeFetch(`${this.apiUrl}/instance/connect/${sessionKey}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!connectRes.ok) {
        console.warn(`[Evolution API] No se pudo obtener QR luego de recrear "${sessionKey}". Estado HTTP: ${connectRes.status}`);
        return null;
      }

      const connectData: any = await connectRes.json();
      const connectQr = this.findQrPayload(connectData);
      if (!connectQr) {
        console.warn(`[Evolution API] QR aun no disponible luego de recrear "${sessionKey}". Campos: ${this.summarizeObjectShape(connectData)}`);
      }
      return connectQr;
    } catch (error: any) {
      console.error(`[Evolution API] No se pudo recuperar QR para "${sessionKey}":`, error.message);
      return null;
    }
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
  async getStatus(sessionKey: string, persistedStatus?: string | null): Promise<string> {
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
      return this.stabilizeStatus(sessionKey, this.mapState(state), persistedStatus);
    } catch (error) {
      return 'disconnected';
    }
  }

  async resolveStatus(sessionKey: string, persistedStatus?: string | null): Promise<string> {
    return this.getStatus(sessionKey, persistedStatus);
  }

  async isConnected(sessionKey: string): Promise<boolean> {
    const status = await this.getStatus(sessionKey);
    return status === 'connected';
  }

  /**
   * Obtiene el código QR de conexión en base64 para pintar en la UI.
   */
  async getQr(sessionKey: string): Promise<string | null> {
    const cached = this.qrCache.get(sessionKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.qr;
    }

    const inflight = this.qrInflight.get(sessionKey);
    if (inflight) {
      return inflight;
    }

    const task = this.fetchQr(sessionKey).finally(() => {
      this.qrInflight.delete(sessionKey);
    });

    this.qrInflight.set(sessionKey, task);
    return task;
  }

  private async fetchQr(sessionKey: string): Promise<string | null> {
    try {
      const status = await this.getStatus(sessionKey);
      if (status === 'connected') {
        this.qrCache.set(sessionKey, { qr: null, expiresAt: Date.now() + 8000 });
        return null;
      }

      await this.init(sessionKey);
      console.log(`[Evolution API] Solicitando QR para "${sessionKey}"...`);
      const res = await this.safeFetch(`${this.apiUrl}/instance/connect/${sessionKey}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!res.ok) {
        console.warn(`[Evolution API] No se pudo obtener QR. Estado HTTP: ${res.status}`);
        this.qrCache.set(sessionKey, { qr: null, expiresAt: Date.now() + 8000 });
        return null;
      }

      const data: any = await res.json();
      const base64 = this.findQrPayload(data);
      if (!base64 && this.isCountOnlyQrResponse(data)) {
        const recoveredQr = await this.recoverQrFromStuckInstance(sessionKey);
        this.qrCache.set(sessionKey, {
          qr: recoveredQr,
          expiresAt: Date.now() + (recoveredQr ? this.qrCacheMs : 8000)
        });
        return recoveredQr;
      }
      if (!base64) {
        console.warn(`[Evolution API] Respuesta QR sin payload legible para "${sessionKey}". Campos: ${this.summarizeObjectShape(data)}`);
      }
      this.qrCache.set(sessionKey, {
        qr: base64,
        expiresAt: Date.now() + (base64 ? this.qrCacheMs : 8000)
      });
      return base64;
    } catch (error: any) {
      console.error(`[Evolution API] Error obteniendo QR para "${sessionKey}":`, error.message);
      this.qrCache.set(sessionKey, { qr: null, expiresAt: Date.now() + 8000 });
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
        const fileBase64 = await this.getMediaBase64(mediaPath);
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

      if (res.status === 404) {
        console.log(`[Evolution API] La instancia "${sessionKey}" no existe en Evolution. Se considera eliminada.`);
        return;
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Fallo al eliminar instancia en Evolution (${res.status}): ${errText}`);
      }
    } catch (error: any) {
      console.error(`[Evolution API] Error al eliminar "${sessionKey}":`, error.message);
      throw error;
    }
  }

  async listProviderInstances(): Promise<WhatsAppProviderInstance[]> {
    try {
      const res = await this.safeFetch(`${this.apiUrl}/instance/fetchInstances`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`No se pudo consultar Evolution (${res.status}): ${errText}`);
      }

      const data: any = await res.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.instances)
          ? data.instances
          : Array.isArray(data?.data)
            ? data.data
            : [];

      return list
        .map((item: any): WhatsAppProviderInstance => {
          const name = String(item?.name || item?.instanceName || item?.instance?.instanceName || '').trim();
          const connectionStatus = String(
            item?.connectionStatus ||
            item?.state ||
            item?.instance?.state ||
            item?.instance?.status ||
            'unknown'
          ).trim();

          return {
            name,
            connectionStatus,
            connected: this.isConnectedState(connectionStatus),
            ownerJid: item?.ownerJid ? String(item.ownerJid) : null,
            profileName: item?.profileName ? String(item.profileName) : null,
            updatedAt: item?.updatedAt ? String(item.updatedAt) : null
          };
        })
        .filter((item: WhatsAppProviderInstance) => item.name);
    } catch (error: any) {
      console.error('[Evolution API] Error listando instancias:', error.message);
      throw error;
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
