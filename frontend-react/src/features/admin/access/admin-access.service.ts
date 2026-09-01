import apiClient from '../../../core/api/apiClient';
import type { AccessCatalog, ChangeSystemUserPassword, SaveSystemUser, SystemUser, SystemUserDetail } from './types';

export const adminAccessService = {
  async listUsers(): Promise<SystemUser[]> {
    const response = await apiClient.get('/admin/usuarios');
    return response.data?.data ?? [];
  },

  async getCatalog(): Promise<AccessCatalog> {
    const response = await apiClient.get('/admin/access/catalog');
    return response.data?.data ?? { company: null, roles: [] };
  },

  async getUser(userId: number): Promise<SystemUserDetail> {
    const response = await apiClient.get(`/admin/usuarios/${userId}`);
    return response.data.data;
  },

  async createUser(input: SaveSystemUser): Promise<void> {
    await apiClient.post('/admin/usuarios', input);
  },

  async updateUser(userId: number, input: SaveSystemUser): Promise<void> {
    await apiClient.put(`/admin/usuarios/${userId}`, input);
  },

  async changePassword(userId: number, input: ChangeSystemUserPassword): Promise<void> {
    await apiClient.patch(`/admin/usuarios/${userId}/password`, input);
  },

  async suspendUser(userId: number): Promise<void> {
    await apiClient.delete(`/admin/usuarios/${userId}`);
  },
};
