export type WhatsAppProviderInstance = {
  name: string;
  connectionStatus: string;
  connected: boolean;
  ownerJid: string | null;
  profileName: string | null;
  updatedAt: string | null;
};

export interface IWhatsAppProvider {
  init(sessionKey: string): Promise<void>;
  getStatus(sessionKey: string): Promise<string>;
  resolveStatus(sessionKey: string, persistedStatus?: string | null): Promise<string>;
  isConnected(sessionKey: string): Promise<boolean>;
  getQr(sessionKey: string): Promise<string | null>;
  sendMessage(
    sessionKey: string,
    to: string,
    message: string,
    mediaPath?: string | null,
    mediaMimeType?: string | null,
    mediaFilename?: string | null
  ): Promise<any>;
  reconnect(sessionKey: string): Promise<void>;
  logout(sessionKey: string): Promise<void>;
  removeSessionData(sessionKey: string): Promise<void>;
  listProviderInstances(): Promise<WhatsAppProviderInstance[]>;
  bootstrapActiveSessions(): Promise<void>;
  cleanupStaleAuthData(retentionDays: number): Promise<number>;
}
