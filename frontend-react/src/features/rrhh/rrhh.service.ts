import apiClient from '../../core/api/apiClient';
import type { ApiEnvelope } from '../../core/api/types';
import { unwrapApiData } from '../../core/api/types';
import type {
  ActivationCredentials,
  Employee,
  EmployeeOperationalProfile,
  EmployeeStatus,
  EmployeeInput,
  DniLookupResult,
  Geofence,
  JobRole,
  RrhhCatalogs,
  ScheduleAssignment,
  WorkSchedule,
  AttendanceDashboard,
  AttendanceTrendPoint,
  AbsenceWorkflows,
  AttendanceCorrectionInput,
  AttendanceDetail,
  EmployeeAttendanceReport,
  EmployeeAttendanceReportMode,
  BiometricContingency,
  SchedulePolicyInput,
  WorkCalendarEvent,
  WorkCalendarInput,
  HolidayProposal,
  HolidayProposalDecisionInput,
  HolidaySyncResult,
  WeeklySchedulePolicy,
  ServicePaymentDashboard, ServicePaymentEmployeeLedger, ServicePaymentHistory,
} from './types';

async function unwrapRequest<T>(request: Promise<{ data: ApiEnvelope<T> }>, fallback?: T) {
  const response = await request;
  return unwrapApiData(response.data, fallback);
}

export const rrhhService = {
  getCatalogs(signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<RrhhCatalogs>>('/rrhh/catalogos', { signal }));
  },
  listEmployees(siteId: number | null, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<Employee[]>>('/rrhh/empleados', {
      params: siteId === null ? undefined : { sede_id: siteId }, signal,
    }), []);
  },
  createEmployee(input: EmployeeInput) {
    return unwrapRequest(apiClient.post<ApiEnvelope<Employee>>('/rrhh/empleados', input));
  },
  updateEmployee(employeeId: number, input: EmployeeInput) {
    return unwrapRequest(apiClient.put<ApiEnvelope<Employee>>(`/rrhh/empleados/${employeeId}`, input));
  },
  uploadEmployeePhoto(employeeId: number, photo: File) {
    const formData = new FormData();
    formData.append('photo', photo);
    return unwrapRequest(apiClient.put<ApiEnvelope<Employee>>(
      `/rrhh/empleados/${employeeId}/foto`, formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    ));
  },
  deleteEmployeePhoto(employeeId: number) {
    return unwrapRequest(apiClient.delete<ApiEnvelope<Employee>>(`/rrhh/empleados/${employeeId}/foto`));
  },
  lookupDni(dni: string) {
    return unwrapRequest(apiClient.post<ApiEnvelope<DniLookupResult>>('/rrhh/identidad/dni/consultar', { dni }));
  },
  createActivation(employeeId: number, password: string, replaceExistingDevice = false) {
    return unwrapRequest(apiClient.post<ApiEnvelope<ActivationCredentials>>(
      `/rrhh/empleados/${employeeId}/activacion-dispositivo`,
      { password, replace_existing_device: replaceExistingDevice },
    ));
  },
  getEmployeeOperationalProfile(employeeId: number, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<EmployeeOperationalProfile>>(
      `/rrhh/empleados/${employeeId}/perfil-operativo`, { signal },
    ));
  },
  setEmployeeStatus(employeeId: number, status: EmployeeStatus, reason: string) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{
      status: EmployeeStatus;
      previous_status: EmployeeStatus;
      mobile_access_revoked: boolean;
      unchanged: boolean;
    }>>(`/rrhh/empleados/${employeeId}/estado`, { status, reason }));
  },
  revokeEmployeeDevice(employeeId: number, reason: string) {
    return unwrapRequest(apiClient.post<ApiEnvelope<never>>(
      `/rrhh/empleados/${employeeId}/revocar-dispositivo`, { motivo: reason },
    ));
  },
  getGeofence(siteId: number, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<Geofence | null>>(`/rrhh/sedes/${siteId}/geocerca`, { signal }), null);
  },
  saveGeofence(siteId: number, input: Omit<Geofence, 'site_id' | 'site_name' | 'updated_at'> & {
    capture_method?: 'MANUAL' | 'DEVICE_GPS';
    capture_accuracy_meters?: number;
  }) {
    return unwrapRequest(apiClient.put<ApiEnvelope<Geofence>>(`/rrhh/sedes/${siteId}/geocerca`, input));
  },
  createJobRole(input: Pick<JobRole, 'name' | 'description' | 'default_tracking_type'>) {
    return unwrapRequest(apiClient.post<ApiEnvelope<JobRole>>('/rrhh/cargos', input));
  },
  updateJobRole(roleId: number, input: Pick<JobRole, 'name' | 'description' | 'default_tracking_type'>) {
    return unwrapRequest(apiClient.put<ApiEnvelope<JobRole>>(`/rrhh/cargos/${roleId}`, input));
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
  getWeeklyPolicy(scope: 'EMPRESA' | 'SEDE', siteId: number, date: string, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<WeeklySchedulePolicy>>('/rrhh/semana-laboral', {
      params: { alcance: scope, sede_id: siteId, fecha: date }, signal,
    }));
  },
  saveWeeklyPolicy(input: {
    scope: 'EMPRESA' | 'SEDE'; site_id: number | null;
    assignments: ScheduleAssignment[]; effective_from: string;
  }) {
    return unwrapRequest(apiClient.put<ApiEnvelope<WeeklySchedulePolicy>>('/rrhh/semana-laboral', input));
  },
  inheritCompanyWeeklyPolicy(siteId: number, effectiveFrom: string) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<WeeklySchedulePolicy>>('/rrhh/semana-laboral/heredar', {
      site_id: siteId, effective_from: effectiveFrom,
    }));
  },
  getWorkCalendar(siteId: number | null, from: string, until: string, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<WorkCalendarEvent[]>>('/rrhh/calendario', {
      params: { sede_id: siteId ?? undefined, desde: from, hasta: until }, signal,
    }), []);
  },
  createWorkCalendarEvent(input: WorkCalendarInput) {
    return unwrapRequest(apiClient.post<ApiEnvelope<WorkCalendarEvent>>('/rrhh/calendario', input));
  },
  cancelWorkCalendarEvent(eventId: number) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<WorkCalendarEvent>>(`/rrhh/calendario/${eventId}/cancelar`));
  },
  getHolidayProposals(year: number, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<HolidayProposal[]>>('/rrhh/calendario/propuestas', {
      params: { anio: year }, signal,
    }), []);
  },
  syncHolidayProposals(year: number) {
    return unwrapRequest(apiClient.post<ApiEnvelope<HolidaySyncResult>>(
      '/rrhh/calendario/propuestas/sincronizar', { year },
    ));
  },
  decideHolidayProposal(proposalId: number, input: HolidayProposalDecisionInput) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<HolidayProposal>>(
      `/rrhh/calendario/propuestas/${proposalId}/decision`, input,
    ));
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
  getAttendanceDashboard(siteId: number | null, date: string, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<AttendanceDashboard>>(
      '/rrhh/asistencias/resumen',
      { params: { fecha: date, ...(siteId === null ? {} : { sede_id: siteId }) }, signal },
    ));
  },
  getAttendanceTrend(siteId: number | null, from: string, until: string, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<AttendanceTrendPoint[]>>(
      '/rrhh/asistencias/tendencia',
      { params: { desde: from, hasta: until, ...(siteId === null ? {} : { sede_id: siteId }) }, signal },
    ), []);
  },
  getAbsenceWorkflows(siteId: number | null, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<AbsenceWorkflows>>('/rrhh/incidencias', {
      params: siteId === null ? undefined : { sede_id: siteId }, signal,
    }));
  },
  async getPermissionEvidence(id: number, siteId: number) {
    const response = await apiClient.get<Blob>(`/rrhh/permisos/${id}/sustento`, {
      params: { sede_id: siteId },
      responseType: 'blob',
    });
    return response.data;
  },
  async getAttendanceJustificationEvidence(id: number, siteId: number) {
    const response = await apiClient.get<Blob>(`/rrhh/justificaciones/${id}/sustento`, {
      params: { sede_id: siteId },
      responseType: 'blob',
    });
    return response.data;
  },
  resolveAttendanceJustification(
    id: number,
    input: { sede_id: number; decision: 'APROBADA' | 'RECHAZADA'; comment: string },
  ) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{ id: number }>>(`/rrhh/justificaciones/${id}/resolver`, input));
  },
  createPermission(input: { sede_id: number; employee_id: number; type: string; start_at: string; end_at: string; reason: string }) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number }>>('/rrhh/permisos', input));
  },
  resolvePermission(id: number, input: { sede_id: number; decision: 'APROBADO' | 'RECHAZADO'; comment: string }) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{ id: number }>>(`/rrhh/permisos/${id}/resolver`, input));
  },
  cancelPermission(id: number, input: { sede_id: number; reason: string }) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{ id: number }>>(`/rrhh/permisos/${id}/cancelar`, input));
  },
  createVacation(input: { sede_id: number; employee_id: number; start_date: string; end_date: string; reason: string }) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number; days: number }>>('/rrhh/vacaciones', input));
  },
  resolveVacation(id: number, input: { sede_id: number; decision: 'APROBADA' | 'RECHAZADA'; comment: string }) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{ id: number }>>(`/rrhh/vacaciones/${id}/resolver`, input));
  },
  cancelVacation(id: number, input: { sede_id: number; reason: string }) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{ id: number }>>(`/rrhh/vacaciones/${id}/cancelar`, input));
  },
  correctAttendance(input: AttendanceCorrectionInput) {
    return unwrapRequest(apiClient.put<ApiEnvelope<{ correction_id: number; attendance_id: number }>>('/rrhh/asistencias/correccion', input));
  },
  getAttendanceDetail(siteId: number, employeeId: number, date: string, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<AttendanceDetail>>('/rrhh/asistencias/detalle', {
      params: { sede_id: siteId, empleado_id: employeeId, fecha: date }, signal,
    }));
  },
  getEmployeeAttendanceReport(
    siteId: number,
    employeeId: number,
    view: EmployeeAttendanceReportMode,
    date: string,
    signal?: AbortSignal,
  ) {
    return unwrapRequest(apiClient.get<ApiEnvelope<EmployeeAttendanceReport>>(
      `/rrhh/asistencias/empleado/${employeeId}/reporte`,
      { params: { sede_id: siteId, vista: view, fecha: date }, signal },
    ));
  },
  reviewOvertime(requestId: number, input: {
    sede_id: number;
    decision: 'APROBAR' | 'RECHAZAR';
    approved_minutes?: number;
    comment: string;
  }) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{
      id: number; status: 'APROBADO' | 'RECHAZADO'; detected_minutes: number; approved_minutes: number | null;
    }>>(`/rrhh/sobretiempo/${requestId}/resolver`, input));
  },
  async getOvertimeEvidence(requestId: number, siteId: number) {
    const response = await apiClient.get<Blob>(`/rrhh/sobretiempo/${requestId}/sustento`, {
      params: { sede_id: siteId },
      responseType: 'blob',
    });
    return response.data;
  },
  reviewAttendanceIncident(input: {
    sede_id: number;
    employee_id: number;
    date: string;
    incident_type: string;
    comment: string;
  }) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number }>>('/rrhh/asistencias/incidencias/resolver', input));
  },
  getBiometricContingencies(siteId: number | null, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<BiometricContingency[]>>(
      '/rrhh/contingencias',
      { params: { estado: 'PENDIENTE', ...(siteId === null ? {} : { sede_id: siteId }) }, signal },
    ), []);
  },
  getBiometricContingencyHistory(siteId: number | null, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<BiometricContingency[]>>(
      '/rrhh/contingencias',
      { params: { estado: 'TODAS', ...(siteId === null ? {} : { sede_id: siteId }) }, signal },
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
  getServicePayments(month: string, siteId: number | null, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<ServicePaymentDashboard>>('/rrhh/pagos', {
      params: { periodo: month, ...(siteId === null ? {} : { sede_id: siteId }) }, signal,
    }));
  },
  getServicePaymentHistory(year: number, siteId: number | null, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<ServicePaymentHistory>>('/rrhh/pagos/historial', {
      params: { anio: year, ...(siteId === null ? {} : { sede_id: siteId }) }, signal,
    }));
  },
  getEmployeePaymentLedger(employeeId: number, month: string, signal?: AbortSignal) {
    return unwrapRequest(apiClient.get<ApiEnvelope<ServicePaymentEmployeeLedger>>(
      `/rrhh/pagos/empleados/${employeeId}/expediente`, { params: { periodo: month }, signal },
    ));
  },
  addEmployeePaymentNote(employeeId: number, input: { month: string; note: string; reference_amount?: number | null }) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number }>>(`/rrhh/pagos/empleados/${employeeId}/notas`, input));
  },
  cancelEmployeePaymentNote(noteId: number, reason: string) {
    return unwrapRequest(apiClient.patch<ApiEnvelope<{ id: number; status: string }>>(`/rrhh/pagos/notas/${noteId}/anular`, { reason }));
  },
  savePaymentAgreement(employeeId: number, input: Record<string, unknown>) {
    return unwrapRequest(apiClient.put<ApiEnvelope<{ id: number }>>(`/rrhh/pagos/empleados/${employeeId}/acuerdo`, input));
  },
  createPaymentMovement(input: Record<string, unknown>) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number }>>('/rrhh/pagos/movimientos', input));
  },
  createEmployeeLoan(input: Record<string, unknown>) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number }>>('/rrhh/pagos/prestamos', input));
  },
  generatePaymentPeriod(month: string) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number; collaborators: number }>>('/rrhh/pagos/periodos/generar', { periodo: month }));
  },
  transitionPaymentPeriod(periodId: number, action: 'ENVIAR_REVISION' | 'DEVOLVER_BORRADOR' | 'APROBAR' | 'CERRAR', reason?: string) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number; status: string }>>(`/rrhh/pagos/periodos/${periodId}/transicion`, { action, reason }));
  },
  createPaymentBatch(periodId: number) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number; code: string; payments: number; total: number }>>(`/rrhh/pagos/periodos/${periodId}/lotes`));
  },
  registerHonorReceipt(liquidationId: number, input: { series: string; number: string; issued_at: string; amount: number }) {
    return unwrapRequest(apiClient.put<ApiEnvelope<{ id: number }>>(`/rrhh/pagos/liquidaciones/${liquidationId}/recibo`, input));
  },
  markServicePaymentPaid(liquidationId: number, operationNumber: string) {
    return unwrapRequest(apiClient.post<ApiEnvelope<{ id: number; status: string }>>(`/rrhh/pagos/liquidaciones/${liquidationId}/deposito`, {
      operation_number: operationNumber,
    }));
  },
};
