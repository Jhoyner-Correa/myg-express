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
  name: string;
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
};
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
  schedule: { name: string; start_time: string; end_time: string } | null;
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
    completed: number;
    overtime_minutes: number;
  };
  employees: AttendanceDashboardEmployee[];
};
