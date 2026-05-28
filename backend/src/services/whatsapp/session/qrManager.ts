class QrManager {
  private qrMap: Map<string, string | null> = new Map();

  setQr(sessionKey: string, qr: string | null): void {
    this.qrMap.set(sessionKey, qr);
  }

  getQr(sessionKey: string): string | null {
    return this.qrMap.get(sessionKey) || null;
  }

  clearQr(sessionKey: string): void {
    this.qrMap.delete(sessionKey);
  }
}

export default new QrManager();