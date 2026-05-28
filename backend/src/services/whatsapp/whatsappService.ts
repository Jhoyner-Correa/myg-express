import { IWhatsAppProvider } from './providers/IWhatsAppProvider';
import { WhatsAppWebProvider } from './providers/WhatsAppWebProvider';
import { EvolutionApiProvider } from './providers/EvolutionApiProvider';

class WhatsAppService {
  private provider: IWhatsAppProvider;

  constructor() {
    const providerType = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
    if (providerType === 'webjs') {
      console.log('[WhatsAppService] Iniciando con proveedor: whatsapp-web.js (Puppeteer)');
      this.provider = new WhatsAppWebProvider();
    } else {
      console.log('[WhatsAppService] Iniciando con proveedor: Evolution API (Baileys REST)');
      this.provider = new EvolutionApiProvider();
    }
  }

  async init(sessionKey: string): Promise<void> {
    await this.provider.init(sessionKey);
  }

  async getStatus(sessionKey: string): Promise<string> {
    return await this.provider.getStatus(sessionKey);
  }

  async resolveStatus(sessionKey: string, persistedStatus?: string | null): Promise<string> {
    return await this.provider.resolveStatus(sessionKey, persistedStatus);
  }

  async isConnected(sessionKey: string): Promise<boolean> {
    return await this.provider.isConnected(sessionKey);
  }

  async getQr(sessionKey: string): Promise<string | null> {
    return await this.provider.getQr(sessionKey);
  }

  async sendMessage(
    sessionKey: string,
    to: string,
    message: string,
    mediaPath?: string | null,
    mediaMimeType?: string | null,
    mediaFilename?: string | null
  ): Promise<any> {
    return await this.provider.sendMessage(sessionKey, to, message, mediaPath, mediaMimeType, mediaFilename);
  }

  async reconnect(sessionKey: string): Promise<void> {
    await this.provider.reconnect(sessionKey);
  }

  async logout(sessionKey: string): Promise<void> {
    await this.provider.logout(sessionKey);
  }

  async removeSessionData(sessionKey: string): Promise<void> {
    await this.provider.removeSessionData(sessionKey);
  }

  async bootstrapActiveSessions(): Promise<void> {
    await this.provider.bootstrapActiveSessions();
  }

  async cleanupStaleAuthData(retentionDays: number): Promise<number> {
    return await this.provider.cleanupStaleAuthData(retentionDays);
  }
}

export default new WhatsAppService();
