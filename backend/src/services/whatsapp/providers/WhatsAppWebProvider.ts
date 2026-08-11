import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import { readdir, readFile, rm } from 'fs/promises';
import path from 'path';
import { pool } from '../../../core/database/database';
import { IWhatsAppProvider, WhatsAppProviderInstance } from './IWhatsAppProvider';
import sessionManager from '../session/sessionManager';
import qrManager from '../session/qrManager';

export class WhatsAppWebProvider implements IWhatsAppProvider {
  private clients: Map<string, Client> = new Map();
  private readyMap: Map<string, boolean> = new Map();
  private initLocks: Map<string, Promise<void>> = new Map();
  private lifecycleLocks: Map<string, Promise<void>> = new Map();
  private listenersBound: Set<string> = new Set();
  private authenticatedSessions: Set<string> = new Set();
  private statusCache: Map<string, { status: string; expiresAt: number }> = new Map();
  private lastUsedAt: Map<string, number> = new Map();
  private readonly runtimeStatusCacheMs = Number(process.env.WHATSAPP_RUNTIME_STATUS_CACHE_MS || 5000);
  private readonly maxActiveClients = Math.max(1, Number(process.env.WHATSAPP_MAX_ACTIVE_CLIENTS || 1));

  private cacheStatus(sessionKey: string, status: string, ttlMs = this.runtimeStatusCacheMs): void {
    this.statusCache.set(sessionKey, {
      status,
      expiresAt: Date.now() + Math.max(0, ttlMs)
    });
  }

  private clearCachedStatus(sessionKey: string): void {
    this.statusCache.delete(sessionKey);
  }

  private getCachedStatus(sessionKey: string): string | null {
    const entry = this.statusCache.get(sessionKey);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.statusCache.delete(sessionKey);
      return null;
    }

    return entry.status;
  }

  private async wait(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private touchSession(sessionKey: string): void {
    this.lastUsedAt.set(sessionKey, Date.now());
  }

  private getAuthRootDir(): string {
    return path.resolve(process.cwd(), '.wwebjs_auth');
  }

  private async destroyClient(sessionKey: string, client: Client): Promise<void> {
    try {
      await client.destroy();
    } catch (_error) {
      // ignore destroy errors during cleanup/rebuild
    } finally {
      this.clients.delete(sessionKey);
      this.readyMap.delete(sessionKey);
      this.authenticatedSessions.delete(sessionKey);
      this.listenersBound.delete(sessionKey);
      this.clearCachedStatus(sessionKey);
      this.lastUsedAt.delete(sessionKey);
    }
  }

  private async enforceClientLimit(sessionKeyToKeep: string): Promise<void> {
    const currentKeys = Array.from(this.clients.keys());

    if (currentKeys.length < this.maxActiveClients) {
      return;
    }

    const candidates = currentKeys
      .filter((key) => key !== sessionKeyToKeep)
      .sort((a, b) => (this.lastUsedAt.get(a) || 0) - (this.lastUsedAt.get(b) || 0));

    const victimKey = candidates[0];
    if (!victimKey) {
      return;
    }

    const victimClient = this.clients.get(victimKey);
    if (!victimClient) {
      return;
    }

    await this.destroyClient(victimKey, victimClient);
    sessionManager.setStatus(victimKey, 'disconnected');
    this.cacheStatus(victimKey, 'disconnected');
    await this.syncSessionStatus(victimKey, 'disconnected');
  }

  private async runLifecycleExclusive<T>(sessionKey: string, task: () => Promise<T>): Promise<T> {
    const previous = this.lifecycleLocks.get(sessionKey) || Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    const slot = previous.finally(() => current);
    this.lifecycleLocks.set(sessionKey, slot);

    try {
      await previous;
      return await task();
    } finally {
      release();

      if (this.lifecycleLocks.get(sessionKey) === slot) {
        this.lifecycleLocks.delete(sessionKey);
      }
    }
  }

  private async resetSessionLocally(sessionKey: string, clearStatus = false): Promise<void> {
    const client = this.clients.get(sessionKey);

    if (client) {
      await this.destroyClient(sessionKey, client);
    }

    // Give Chromium a short moment to release file handles on Windows.
    await this.wait(500);
    await this.removeAuthDirWithRetries(sessionKey);
    qrManager.clearQr(sessionKey);

    if (clearStatus) {
      sessionManager.clearStatus(sessionKey);
      this.clearCachedStatus(sessionKey);
      return;
    }

    sessionManager.setStatus(sessionKey, 'disconnected');
    this.cacheStatus(sessionKey, 'disconnected');
    await this.syncSessionStatus(sessionKey, 'disconnected');
  }

  private async removeAuthDirWithRetries(sessionKey: string): Promise<void> {
    const authDir = path.resolve(this.getAuthRootDir(), `session-${sessionKey}`);
    let lastError: unknown;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await rm(authDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
        return;
      } catch (error: any) {
        lastError = error;

        if (error?.code !== 'EBUSY' && error?.code !== 'EPERM') {
          throw error;
        }

        await this.wait(250 * attempt);
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  private mapClientStateToStatus(clientState: string | null | undefined, fallbackStatus?: string | null): string {
    const state = String(clientState || '').toUpperCase();
    const fallback = String(fallbackStatus || '').toLowerCase();

    if (state === 'CONNECTED') return 'connected';
    if (state === 'OPENING') return 'initializing';
    if (state === 'PAIRING') return 'waiting_qr';
    if (state === 'TIMEOUT' || state === 'CONFLICT') return 'reconnecting';
    if (state === 'UNPAIRED' || state === 'UNPAIRED_IDLE' || state === 'UNLAUNCHED') return 'disconnected';

    if (['waiting_qr', 'initializing', 'authenticated', 'reconnecting', 'auth_failure', 'disconnected'].includes(fallback)) {
      return fallback;
    }

    return 'disconnected';
  }

  private getPuppeteerConfig() {
    const executablePath =
      process.env.CHROMIUM_PATH ||
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      undefined;

    return {
      headless: true,
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote'
      ]
    };
  }

  private normalizePhoneForWhatsApp(to: string): string {
    const raw = String(to || '').trim();
    const withoutSuffix = raw.replace(/@c\.us$/i, '');
    const digits = withoutSuffix.replace(/[^\d]/g, '');

    if (!digits) {
      return raw;
    }

    // If the number comes as a local Peruvian mobile (9 digits), normalize it to 51.
    if (digits.length === 9) {
      return `51${digits}`;
    }

    // If the user typed a leading zero, normalize it as a Peruvian local number too.
    if (digits.length === 10 && digits.startsWith('0')) {
      return `51${digits.slice(1)}`;
    }

    return digits;
  }

  private validateNormalizedPhone(normalizedPhone: string): void {
    if (!normalizedPhone) {
      throw new Error('Numero vacio o sin digitos validos para WhatsApp');
    }

    if (!/^\d{11,15}$/.test(normalizedPhone)) {
      throw new Error(`Numero con formato invalido para WhatsApp: ${normalizedPhone}`);
    }
  }

  private async syncSessionStatus(sessionKey: string, estado: string, updateLastConnection = false): Promise<void> {
    const query = updateLastConnection
      ? `UPDATE whatsapp_sesiones
         SET estado = ?, ultima_conexion = NOW()
         WHERE session_key = ?
           AND (estado <> ? OR estado IS NULL)`
      : `UPDATE whatsapp_sesiones
         SET estado = ?
         WHERE session_key = ?
           AND (estado <> ? OR estado IS NULL)`;

    try {
      await pool.query(query, [estado, sessionKey, estado]);
    } catch (error) {
      console.error(`[${sessionKey}] Error sincronizando estado en BD:`, error);
    }
  }

  private buildClient(sessionKey: string): Client {
    const authStrategy = new LocalAuth({
      clientId: sessionKey
    });
    const originalLogout = authStrategy.logout.bind(authStrategy);
    authStrategy.logout = async (): Promise<void> => {
      try {
        await originalLogout();
      } catch (error: any) {
        const code = String(error?.code || '').toUpperCase();
        const message = String(error?.message || '');
        const isWindowsLock = (code === 'EBUSY' || code === 'EPERM')
          && message.includes('.wwebjs_auth');

        if (isWindowsLock) {
          console.warn('[WhatsApp] LocalAuth.logout omitido por archivo bloqueado de Chromium:', message);
          return;
        }

        throw error;
      }
    };

    const client = new Client({
      authStrategy,
      puppeteer: this.getPuppeteerConfig()
    });

    this.bindClientListeners(sessionKey, client);
    return client;
  }

  private bindClientListeners(sessionKey: string, client: Client): void {
    if (this.listenersBound.has(sessionKey)) {
      return;
    }

    this.listenersBound.add(sessionKey);

    client.on('qr', async (qr) => {
      qrManager.setQr(sessionKey, qr);
      sessionManager.setStatus(sessionKey, 'waiting_qr');
      this.cacheStatus(sessionKey, 'waiting_qr');
      await this.syncSessionStatus(sessionKey, 'waiting_qr');
      console.log(`[${sessionKey}] QR generado`);
    });

    client.on('ready', async () => {
      qrManager.clearQr(sessionKey);
      sessionManager.setStatus(sessionKey, 'connected');
      this.readyMap.set(sessionKey, true);
      this.cacheStatus(sessionKey, 'connected');
      await this.syncSessionStatus(sessionKey, 'connected', true);
      console.log(`[${sessionKey}] WhatsApp conectado y listo para enviar`);
    });

    client.on('authenticated', async () => {
      const currentStatus = sessionManager.getStatus(sessionKey);

      if (currentStatus === 'connected' || this.authenticatedSessions.has(sessionKey)) {
        return;
      }

      this.authenticatedSessions.add(sessionKey);
      sessionManager.setStatus(sessionKey, 'authenticated');
      this.cacheStatus(sessionKey, 'authenticated');
      await this.syncSessionStatus(sessionKey, 'authenticated');
      console.log(`[${sessionKey}] WhatsApp autenticado`);
    });

    client.on('auth_failure', async (msg) => {
      sessionManager.setStatus(sessionKey, 'auth_failure');
      this.readyMap.delete(sessionKey);
      this.authenticatedSessions.delete(sessionKey);
      this.cacheStatus(sessionKey, 'auth_failure');
      await this.syncSessionStatus(sessionKey, 'auth_failure');
      console.error(`[${sessionKey}] Error de autenticacion:`, msg);
    });

    client.on('disconnected', async (reason) => {
      sessionManager.setStatus(sessionKey, 'disconnected');
      this.readyMap.delete(sessionKey);
      this.authenticatedSessions.delete(sessionKey);
      this.cacheStatus(sessionKey, 'disconnected');

      console.log(`[${sessionKey}] WhatsApp desconectado:`, reason);

      if (reason === 'LOGOUT') {
        console.log(`[${sessionKey}] El usuario cerró sesión desde su celular. Actualizando estado...`);
        try {
          await pool.query(
            `UPDATE whatsapp_sesiones
             SET activo = 0,
                 estado = 'disconnected',
                 updated_at = NOW()
             WHERE session_key = ?`,
            [sessionKey]
          );
          // Poner todos los avisos pendientes/en_cola de este lote como fallidos
          // para que el usuario sepa que se interrumpió el envío
          const [sesiones]: any = await pool.query(
            `SELECT id FROM whatsapp_sesiones WHERE session_key = ?`,
            [sessionKey]
          );
          if (sesiones?.length) {
            await pool.query(
              `UPDATE avisos_diarios
               SET estado_aviso = 'fallido',
                   error_detalle = 'La sesión se cerró desde el celular durante el envío.'
               WHERE whatsapp_sesion_id = ?
                 AND estado_aviso IN ('pendiente', 'en_cola')`,
              [sesiones[0].id]
            );
          }
        } catch (error) {
          console.error(`[${sessionKey}] Error al actualizar estado tras LOGOUT:`, error);
        }
        // Limpiar datos de sesión local
        try {
          await this.removeSessionData(sessionKey);
        } catch (_e) {
          // ignorar si falla la limpieza
        }
      } else {
        await this.syncSessionStatus(sessionKey, 'disconnected');
      }
    });
  }

  async bootstrapActiveSessions(): Promise<void> {
    const [rows]: any = await pool.query(
      `SELECT session_key, estado
       FROM whatsapp_sesiones
       WHERE activo = 1
       ORDER BY id ASC`
    );

    for (const row of rows || []) {
      const sessionKey = String(row.session_key || '');
      const persistedStatus = String(row.estado || '').toLowerCase();
      if (!sessionKey) continue;

      if (['disconnected', 'auth_failure', 'inactive', 'blocked'].includes(persistedStatus)) {
        continue;
      }

      try {
        await this.init(sessionKey);
        await this.wait(250);
      } catch (error) {
        console.error(`[${sessionKey}] Error rehidratando sesion de WhatsApp:`, error);
        sessionManager.setStatus(sessionKey, 'disconnected');
        await this.syncSessionStatus(sessionKey, 'disconnected');
      }
    }
  }

  async init(sessionKey: string): Promise<void> {
    this.touchSession(sessionKey);
    const inflightInit = this.initLocks.get(sessionKey);
    if (inflightInit) {
      await inflightInit;
      return;
    }

    const initPromise = this.performInit(sessionKey);
    this.initLocks.set(sessionKey, initPromise);

    try {
      await initPromise;
    } finally {
      this.initLocks.delete(sessionKey);
    }
  }

  private async performInit(sessionKey: string): Promise<void> {
    let client = this.clients.get(sessionKey);
    const currentStatus = sessionManager.getStatus(sessionKey);

    if (client) {
      this.bindClientListeners(sessionKey, client);
    }

    if (client && (this.readyMap.get(sessionKey) || ['initializing', 'waiting_qr', 'authenticated', 'connected'].includes(currentStatus))) {
      return;
    }

    if (client && ['disconnected', 'auth_failure'].includes(currentStatus)) {
      await this.destroyClient(sessionKey, client);
      client = undefined;
    }

    if (!client) {
      await this.enforceClientLimit(sessionKey);
      client = this.buildClient(sessionKey);
      this.clients.set(sessionKey, client);
      this.touchSession(sessionKey);
    }

    sessionManager.setStatus(sessionKey, 'initializing');
    this.cacheStatus(sessionKey, 'initializing');
    await this.syncSessionStatus(sessionKey, 'initializing');

    try {
      await client.initialize();
    } catch (error) {
      this.readyMap.delete(sessionKey);
      this.authenticatedSessions.delete(sessionKey);
      sessionManager.setStatus(sessionKey, 'disconnected');
      this.cacheStatus(sessionKey, 'disconnected');
      await this.syncSessionStatus(sessionKey, 'disconnected');
      throw error;
    }
  }

  async getStatus(sessionKey: string): Promise<string> {
    return sessionManager.getStatus(sessionKey);
  }

  async resolveStatus(sessionKey: string, persistedStatus?: string | null): Promise<string> {
    this.touchSession(sessionKey);
    const inMemoryStatus = sessionManager.getStatus(sessionKey);

    if (this.readyMap.get(sessionKey) || inMemoryStatus === 'connected') {
      this.cacheStatus(sessionKey, 'connected');
      return 'connected';
    }

    if (qrManager.getQr(sessionKey)) {
      this.cacheStatus(sessionKey, 'waiting_qr');
      return 'waiting_qr';
    }

    if (['initializing', 'waiting_qr', 'authenticated', 'reconnecting', 'auth_failure'].includes(inMemoryStatus)) {
      this.cacheStatus(sessionKey, inMemoryStatus);
      return inMemoryStatus;
    }

    const cachedStatus = this.getCachedStatus(sessionKey);
    if (cachedStatus) {
      return cachedStatus;
    }

    const client = this.clients.get(sessionKey);
    if (!client) {
      const resolvedStatus = this.mapClientStateToStatus(null, inMemoryStatus || persistedStatus);
      this.cacheStatus(sessionKey, resolvedStatus);
      return resolvedStatus;
    }

    try {
      const rawState = await client.getState();
      const resolvedStatus = this.mapClientStateToStatus(rawState, inMemoryStatus || persistedStatus);
      this.cacheStatus(sessionKey, resolvedStatus);
      return resolvedStatus;
    } catch (error) {
      console.error(`[${sessionKey}] Error resolviendo estado real:`, error);
      this.readyMap.delete(sessionKey);
      this.authenticatedSessions.delete(sessionKey);
      sessionManager.setStatus(sessionKey, 'disconnected');
      this.cacheStatus(sessionKey, 'disconnected');
      await this.syncSessionStatus(sessionKey, 'disconnected');
      return 'disconnected';
    }
  }

  async isConnected(sessionKey: string): Promise<boolean> {
    const status = await this.resolveStatus(sessionKey);
    return status === 'connected';
  }

  async getQr(sessionKey: string): Promise<string | null> {
    return qrManager.getQr(sessionKey);
  }

  async sendMessage(
    sessionKey: string,
    to: string,
    message: string,
    mediaPath?: string | null,
    mediaMimeType?: string | null,
    mediaFilename?: string | null
  ): Promise<any> {
    this.touchSession(sessionKey);
    const client = this.clients.get(sessionKey);

    if (!client) {
      throw new Error(`Cliente no inicializado para ${sessionKey}`);
    }

    const connected = await this.isConnected(sessionKey);
    if (!connected) {
      throw new Error('Sesion no lista para enviar. Vuelve a conectar el dispositivo.');
    }

    const normalizedPhone = this.normalizePhoneForWhatsApp(to);
    this.validateNormalizedPhone(normalizedPhone);

    const chatId = normalizedPhone.includes('@c.us')
      ? normalizedPhone
      : `${normalizedPhone}@c.us`;

    console.log('Enviando mensaje:');
    console.log('Session:', sessionKey);
    console.log('To original:', to);
    console.log('To normalizado:', chatId);
    console.log('Message:', message);

    try {
      const destination = await client.getNumberId(normalizedPhone);

      if (!destination?._serialized) {
        throw new Error(`El número destino (cliente) ${normalizedPhone} no tiene una cuenta de WhatsApp registrada.`);
      }

      const resolvedChatId = destination._serialized;

      if (mediaPath) {
        if (!mediaMimeType) {
          throw new Error('Tipo de archivo no configurado para el adjunto de WhatsApp');
        }

        const fileBuffer = await readFile(mediaPath);
        const media = new MessageMedia(
          mediaMimeType,
          fileBuffer.toString('base64'),
          mediaFilename || path.basename(mediaPath)
        );
        const result = await client.sendMessage(resolvedChatId, media, { caption: message || '' });
        console.log('Imagen enviada correctamente');
        return result;
      }

      const result = await client.sendMessage(resolvedChatId, message);
      console.log('Mensaje enviado correctamente');
      return result;
    } catch (err) {
      console.error('Error enviando mensaje:', err);
      throw err;
    }
  }

  async reconnect(sessionKey: string): Promise<void> {
    await this.runLifecycleExclusive(sessionKey, async () => {
      const client = this.clients.get(sessionKey);

      if (client) {
        await this.destroyClient(sessionKey, client);
      }

      qrManager.clearQr(sessionKey);
      sessionManager.setStatus(sessionKey, 'reconnecting');
      this.cacheStatus(sessionKey, 'reconnecting');
      await this.syncSessionStatus(sessionKey, 'reconnecting');

      const newClient = this.buildClient(sessionKey);
      this.clients.set(sessionKey, newClient);
      await newClient.initialize();
    });
  }

  async logout(sessionKey: string): Promise<void> {
    await this.runLifecycleExclusive(sessionKey, async () => {
      const client = this.clients.get(sessionKey);
      const currentStatus = sessionManager.getStatus(sessionKey);

      if (!client && currentStatus === 'disconnected') {
        qrManager.clearQr(sessionKey);
        await this.syncSessionStatus(sessionKey, 'disconnected');
        return;
      }

      await this.resetSessionLocally(sessionKey, false);
    });
  }

  async removeSessionData(sessionKey: string): Promise<void> {
    await this.runLifecycleExclusive(sessionKey, async () => {
      await this.resetSessionLocally(sessionKey, true);
    });
  }

  async listProviderInstances(): Promise<WhatsAppProviderInstance[]> {
    return Array.from(this.clients.keys()).map((sessionKey) => {
      const status = sessionManager.getStatus(sessionKey) || 'disconnected';
      return {
        name: sessionKey,
        connectionStatus: status,
        connected: status === 'connected',
        ownerJid: null,
        profileName: null,
        updatedAt: null
      };
    });
  }

  async cleanupStaleAuthData(retentionDays: number): Promise<number> {
    const authRoot = this.getAuthRootDir();
    const cutoffMs = Date.now() - Math.max(0, retentionDays) * 24 * 60 * 60 * 1000;
    let removed = 0;

    try {
      const [rows]: any = await pool.query(
        `SELECT session_key, activo, updated_at
         FROM whatsapp_sesiones`
      );

      const keepKeys = new Set<string>();
      for (const row of rows || []) {
        const sessionKey = String(row.session_key || '');
        const active = Number(row.activo || 0) === 1;
        const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;

        if (sessionKey && (active || updatedAt >= cutoffMs)) {
          keepKeys.add(`session-${sessionKey}`);
        }
      }

      const entries = await readdir(authRoot, { withFileTypes: true }).catch(() => []);

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!entry.name.startsWith('session-')) continue;
        if (keepKeys.has(entry.name)) continue;

        await rm(path.join(authRoot, entry.name), { recursive: true, force: true });
        removed += 1;
      }
    } catch (error) {
      console.error('Error limpiando auth data antigua de WhatsApp:', error);
    }

    return removed;
  }
}
