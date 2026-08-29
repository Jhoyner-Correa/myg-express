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

export async function updateProfilePhoto(file: File): Promise<UserSession> {
  const form = new FormData();
  form.append('photo', file);
  const { data } = await apiClient.put<ProfileResponse>('/auth/perfil/foto', form);
  return data.user;
}

export async function deleteProfilePhoto(): Promise<UserSession> {
  const { data } = await apiClient.delete<ProfileResponse>('/auth/perfil/foto');
  return data.user;
}
