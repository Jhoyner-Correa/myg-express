import { apiClient } from '../api/apiClient';
import type { UserSession } from './authState';

export type ProfileUpdateInput = {
  nombre: string;
  usuario: string;
  password_actual?: string;
  nuevo_password?: string;
};

type ProfileResponse = {
  ok: boolean;
  message: string;
  user: UserSession;
};

export async function updateProfile(input: ProfileUpdateInput): Promise<UserSession> {
  const { data } = await apiClient.put<ProfileResponse>('/auth/perfil', input);
  return data.user;
}
