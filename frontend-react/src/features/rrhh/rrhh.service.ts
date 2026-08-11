import apiClient from '../../core/api/apiClient';
import type { ApiEnvelope } from '../../core/api/types';
import { unwrapApiData } from '../../core/api/types';
import type { Employee } from './types';

export const rrhhService = {
  async listEmployeesByBranch(branchId: number, signal?: AbortSignal): Promise<Employee[]> {
    const response = await apiClient.get<ApiEnvelope<Employee[]>>(`/rrhh/empleados/sede/${branchId}`, { signal });
    return unwrapApiData(response.data, []);
  },
};
