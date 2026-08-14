import apiClient from '../../core/api/apiClient';
import type { UserSession } from '../../core/auth/authState';

type LoginResponse = {
  ok: boolean;
  token?: string;
  user?: UserSession;
  message?: string;
};

export const authService = {
  async login(username: string, password: string): Promise<{ token: string; user: UserSession }> {
    const response = await apiClient.post<LoginResponse>('/auth/login', { usuario: username, password });
    if (!response.data.ok || !response.data.token || !response.data.user) {
      throw new Error(response.data.message || 'No fue posible iniciar sesión.');
    }
    return {
      token: response.data.token,
      user: response.data.user,
    };
  },
};
