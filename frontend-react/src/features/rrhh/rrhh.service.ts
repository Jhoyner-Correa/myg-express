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
  AttendanceDashboard,
  AbsenceWorkflows,
  AttendanceCorrectionInput,
  BiometricContingency,
  SchedulePolicyInput,
  WorkCalendarEvent,
  WorkCalendarInput,
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
  createSchedule(input: SchedulePolicyInput) {
    return unwrapRequest(apiClient.post<ApiEnvelope<WorkSchedule>>('/rrhh/horarios', input));
  },
  updateSchedule(scheduleId: number, input: SchedulePolicyInput) {
    return unwrapRequest(apiClient.put<ApiEnvelope<WorkSchedule>>(`/rrhh/horarios/${scheduleId}`, input));
  },
  setScheduleStatus(scheduleId: number, status: WorkSchedule['status']) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<WorkSchedule>>(`/rrhh/horarios/${scheduleId}/estado`, { status }));
  },
  getWorkCalendar(siteId: number, from: string, until: string, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<WorkCalendarEvent[]>>('/rrhh/calendario', {
      params: { sede_id: siteId, desde: from, hasta: until }, signal,
    }), []);
  },
  createWorkCalendarEvent(input: WorkCalendarInput) {
    return unwrapRequest(apiClient.post<ApiEnvelope<WorkCalendarEvent>>('/rrhh/calendario', input));
  },
  cancelWorkCalendarEvent(eventId: number) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<WorkCalendarEvent>>(`/rrhh/calendario/${eventId}/cancelar`));
  },
  getEmployeeSchedule(employeeId: number, date?: string) {
    return unwrapRequest(apiClient.get<ApiEnvelope<ScheduleAssignment[]>>(
      `/rrhh/empleados/${employeeId}/horario`, { params: date ? { fecha: date } : undefined },
    ), []);
  },
  saveEmployeeSchedule(employeeId: number, assignments: ScheduleAssignment[], effectiveFrom: string) {
    return unwrapRequest(apiClient.put<ApiEnvelope<ScheduleAssignment[]>>(
      `/rrhh/empleados/${employeeId}/horario`, { assignments, effective_from: effectiveFrom },
    ), []);
  },
  getAttendanceDashboard(siteId: number, date: string, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<AttendanceDashboard>>(
      `/rrhh/asistencias/resumen/sede/${siteId}`,
      { params: { fecha: date }, signal },
    ));
  },
  getAbsenceWorkflows(siteId: number, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<AbsenceWorkflows>>(`/rrhh/incidencias/sede/${siteId}`, { signal }));
  },
  createPermission(input: { sede_id: number; employee_id: number; type: string; start_at: string; end_at: string; reason: string }) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number }>>('/rrhh/permisos', input));
  },
  resolvePermission(id: number, input: { sede_id: number; decision: 'APROBADO' | 'RECHAZADO'; comment: string }) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{ id: number }>>(`/rrhh/permisos/${id}/resolver`, input));
  },
  createVacation(input: { sede_id: number; employee_id: number; start_date: string; end_date: string; reason: string }) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number; days: number }>>('/rrhh/vacaciones', input));
  },
  resolveVacation(id: number, input: { sede_id: number; decision: 'APROBADA' | 'RECHAZADA'; comment: string }) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{ id: number }>>(`/rrhh/vacaciones/${id}/resolver`, input));
  },
  correctAttendance(input: AttendanceCorrectionInput) {
    return unwrapRequest(apiClient.put<ApiEnvelope<{ correction_id: number; attendance_id: number }>>('/rrhh/asistencias/correccion', input));
  },
  getBiometricContingencies(siteId: number, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<BiometricContingency[]>>(
      `/rrhh/contingencias/sede/${siteId}`,
      { params: { estado: 'PENDIENTE' }, signal },
    ), []);
  },
  resolveBiometricContingency(id: number, input: { sede_id: number; decision: 'APROBAR' | 'RECHAZAR'; comment: string }) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{ id: number; status: string; mark_id: number | null }>>(
      `/rrhh/contingencias/${id}/resolver`,
      input,
    ));
  },
  async getBiometricEvidence(id: number, siteId: number, signal?: AbortSignal) {
    const response = await apiClient.get<Blob>(`/rrhh/contingencias/${id}/evidencia`, {
      params: { sede_id: siteId },
      responseType: 'blob',
      signal,
    });
    return response.data;
  },
};
