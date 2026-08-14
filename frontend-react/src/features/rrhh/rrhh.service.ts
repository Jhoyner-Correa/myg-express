import apiClient from '../../core/api/apiClient';
import type { ApiEnvelope } from '../../core/api/types';
import { unwrapApiData } from '../../core/api/types';
import type {
  ActivationCredentials,
  Employee,
  EmployeeInput,
  Geofence,
  JobRole,
  RrhhCatalogs,
  ScheduleAssignment,
  WorkSchedule,
} from './types';

async function unwrapRequest<T>(request: Promise<{ data: ApiEnvelope<T> }>, fallback?: T) {
  const response = await request;
  return unwrapApiData(response.data, fallback);
}

export const rrhhService = {
  getCatalogs(signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<RrhhCatalogs>>('/rrhh/catalogos', { signal }));
  },
  listEmployeesByBranch(branchId: number, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<Employee[]>>(`/rrhh/empleados/sede/${branchId}`, { signal }), []);
  },
  createEmployee(input: EmployeeInput) {
    return unwrapRequest(apiClient.post<ApiEnvelope<Employee>>('/rrhh/empleados', input));
  },
  updateEmployee(employeeId: number, input: EmployeeInput) {
    return unwrapRequest(apiClient.put<ApiEnvelope<Employee>>(`/rrhh/empleados/${employeeId}`, input));
  },
  createActivation(employeeId: number) {
    return unwrapRequest(apiClient.post<ApiEnvelope<ActivationCredentials>>(`/rrhh/empleados/${employeeId}/activacion-dispositivo`));
  },
  getGeofence(siteId: number, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<Geofence | null>>(`/rrhh/sedes/${siteId}/geocerca`, { signal }), null);
  },
  saveGeofence(siteId: number, input: Omit<Geofence, 'site_id' | 'updated_at'>) {
    return unwrapRequest(apiClient.put<ApiEnvelope<Geofence>>(`/rrhh/sedes/${siteId}/geocerca`, input));
  },
  createJobRole(input: Pick<JobRole, 'name' | 'description' | 'default_tracking_type'>) {
    return unwrapRequest(apiClient.post<ApiEnvelope<JobRole>>('/rrhh/cargos', input));
  },
  createSchedule(input: Pick<WorkSchedule, 'name' | 'start_time' | 'end_time' | 'tolerance_minutes'>) {
    return unwrapRequest(apiClient.post<ApiEnvelope<WorkSchedule>>('/rrhh/horarios', input));
  },
  getEmployeeSchedule(employeeId: number) {
    return unwrapRequest(apiClient.get<ApiEnvelope<ScheduleAssignment[]>>(`/rrhh/empleados/${employeeId}/horario`), []);
  },
  saveEmployeeSchedule(employeeId: number, assignments: ScheduleAssignment[]) {
    return unwrapRequest(apiClient.put<ApiEnvelope<ScheduleAssignment[]>>(`/rrhh/empleados/${employeeId}/horario`, { assignments }), []);
  },
};
