class SessionManager {
  private sessionStatus: Map<string, string> = new Map();

  setStatus(sessionKey: string, status: string): void {
    this.sessionStatus.set(sessionKey, status);
  }

  getStatus(sessionKey: string): string {
    return this.sessionStatus.get(sessionKey) || 'disconnected';
  }

  clearStatus(sessionKey: string): void {
    this.sessionStatus.delete(sessionKey);
  }
}

export default new SessionManager();