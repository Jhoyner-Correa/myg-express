export type EmployeeGender = 'M' | 'F';
export type EmployeeTracking = 'NINGUNO' | 'SOLO_MARCACION' | 'CONTINUO';
export type EmployeeStatus = 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';

export type Employee = {
  id: number;
  codigoEmpleado: string;
  sedeId: number;
  cargoId: number;
  dni: string;
  nombres: string;
  apellidos: string;
  sexo: EmployeeGender;
  telefono: string | null;
  email: string | null;
  fechaIngreso: string;
  tipoRastreo: EmployeeTracking;
  estado: EmployeeStatus;
  observaciones: string | null;
  cargoNombre?: string;
};

export type Site = { id: number; name: string; status: string };
export type JobRole = {
  id: number;
  name: string;
  description: string | null;
  default_tracking_type: EmployeeTracking;
};
export type WorkSchedule = {
  id: number;
  version_id: number;
  version: number;
  name: string;
  status: 'ACTIVO' | 'INACTIVO';
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
  lunch_enabled: boolean;
  lunch_start_from: string | null;
  lunch_start_until: string | null;
  lunch_duration_minutes: number;
  return_tolerance_minutes: number;
  effective_from: string;
  effective_until: string | null;
};
export type SchedulePolicyInput = Omit<WorkSchedule, 'id' | 'version_id' | 'version' | 'status' | 'effective_until'>;
export type RrhhCatalogs = { sites: Site[]; roles: JobRole[]; schedules: WorkSchedule[] };

export type EmployeeInput = {
  codigo_empleado: string;
  sede_id: number;
  cargo_id: number;
  dni: string;
  nombres: string;
  apellidos: string;
  sexo: EmployeeGender;
  telefono: string;
  email: string;
  fecha_ingreso: string;
  tipo_rastreo: EmployeeTracking;
  estado: EmployeeStatus;
  observaciones: string;
};

export type Geofence = {
  site_id: number;
  latitude: number;
  longitude: number;
  radius_meters: number;
  maximum_accuracy_meters: number;
  updated_at?: string;
};

export type ScheduleAssignment = {
  weekday: number;
  schedule_id: number;
  schedule_name?: string;
  start_time?: string;
  end_time?: string;
  effective_from?: string;
  effective_until?: string | null;
};

export type ActivationCredentials = {
  temporary_password: string;
  activation_code: string;
  expires_in_seconds: number;
};

export type AttendanceDashboardEmployee = {
  employee_id: number;
  employee_code: string;
  names: string;
  last_names: string;
  job_role: string;
  attendance_id: number | null;
  status: 'PRESENTE' | 'TARDANZA' | 'FALTA' | 'PERMISO' | 'VACACIONES' | 'SIN_REGISTRO';
  delay_minutes: number;
  overtime_minutes: number;
  schedule: {
    name: string;
    start_time: string;
    end_time: string;
    lunch_enabled: boolean;
    lunch_start_from: string | null;
    lunch_start_until: string | null;
    lunch_duration_minutes: number;
    return_tolerance_minutes: number;
  } | null;
  marks: { entry: string | null; lunch_out: string | null; lunch_return: string | null; exit: string | null };
};

export type AttendanceDashboard = {
  date: string;
  site_id: number;
  summary: {
    total_employees: number;
    present: number;
    on_time: number;
    late: number;
    without_record: number;
    authorized_absence: number;
    completed: number;
    overtime_minutes: number;
  };
  employees: AttendanceDashboardEmployee[];
};

export type BiometricContingency = {
  id: number;
  request_id: string;
  employee_id: number;
  site_id: number;
  device_id: number;
  clock_type: 'ENTRADA' | 'SALIDA_ALMUERZO' | 'REGRESO' | 'SALIDA';
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  distance_meters: number;
  captured_at: string;
  biometric_failure_code: string;
  status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';
  reviewer_id: number | null;
  review_comment: string | null;
  reviewed_at: string | null;
  mark_id: number | null;
  expires_at: string;
  created_at: string;
  employee_code: string;
  employee_names: string;
  employee_last_names: string;
  job_role: string;
};

export type PermissionRequest = {
  id: number;
  empleado_id: number;
  tipo_permiso: 'MEDICO' | 'PERSONAL' | 'FAMILIAR' | 'OTRO';
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  comentario_resolucion: string | null;
  resuelto_en: string | null;
  created_at: string;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  cargo_nombre: string;
};

export type VacationRequest = {
  id: number;
  empleado_id: number;
  periodo_anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  dias_tomados: number;
  motivo: string | null;
  estado: 'SOLICITADA' | 'APROBADA' | 'RECHAZADA' | 'PROGRAMADA' | 'EN_CURSO' | 'COMPLETADA' | 'CANCELADA';
  comentario_revision: string | null;
  revisado_en: string | null;
  created_at: string;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  cargo_nombre: string;
};

export type AbsenceWorkflows = { permissions: PermissionRequest[]; vacations: VacationRequest[] };

export type AttendanceCorrectionInput = {
  sede_id: number;
  employee_id: number;
  date: string;
  status: AttendanceDashboardEmployee['status'];
  attendance_type: 'NORMAL' | 'REMOTA' | 'COMISION' | 'VISITA';
  delay_minutes: number;
  reason: string;
  marks: Record<'ENTRADA' | 'SALIDA_ALMUERZO' | 'REGRESO' | 'SALIDA', string | null>;
};
