export type EmployeeGender = 'M' | 'F';
export type EmployeeTracking = 'NINGUNO' | 'SOLO_MARCACION' | 'CONTINUO';
export type EmployeeStatus = 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';

export type Employee = {
  id: number;
  codigoEmpleado: string;
  sedeId: number;
  cargoId: number;
  dni: string;
  ruc: string | null;
  nombres: string;
  apellidos: string;
  sexo: EmployeeGender;
  telefono: string | null;
  email: string | null;
  direccion: string;
  foto?: string | null;
  fechaIngreso: string;
  tipoRastreo: EmployeeTracking;
  estado: EmployeeStatus;
  observaciones: string | null;
  cargoNombre?: string;
  sedeNombre?: string;
  accesoMovilActivo?: boolean;
};

export type EmployeeAttendanceHistoryItem = {
  id: number;
  date: string;
  status: 'PRESENTE' | 'TARDANZA' | 'FALTA' | 'PERMISO' | 'VACACIONES';
  attendance_type: string;
  delay_minutes: number;
  entry_at: string | null;
  lunch_out_at: string | null;
  lunch_return_at: string | null;
  exit_at: string | null;
};

export type EmployeeOperationalProfile = {
  employee: {
    id: number;
    code: string;
    site_id: number;
    site_name: string;
    role_id: number;
    role_name: string;
    document: string;
    ruc: string | null;
    first_names: string;
    last_names: string;
    gender: EmployeeGender;
    phone: string | null;
    email: string | null;
    address: string;
    photo: string | null;
    admission_date: string;
    termination_date: string | null;
    tracking_type: EmployeeTracking;
    status: EmployeeStatus;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };
  attendance: {
    period_days: number;
    total_days: number;
    present_days: number;
    late_days: number;
    absent_days: number;
    delay_minutes: number;
    last_attendance_date: string | null;
    recent: EmployeeAttendanceHistoryItem[];
  };
  mobile: null | {
    id: number;
    installation_id: string;
    brand: string | null;
    model: string | null;
    os_version: string | null;
    app_version: string | null;
    status: 'AUTORIZADO' | 'BLOQUEADO' | 'PENDIENTE';
    biometric_registered_at: string | null;
    authorized_at: string | null;
    revoked_at: string | null;
    revocation_reason: string | null;
    last_access_at: string | null;
    active_sessions: number;
  };
  audit: Array<{
    id: number;
    event_type: string;
    successful: boolean;
    result_code: string;
    actor_name: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
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
  entry_open_before_minutes: number;
  lunch_open_before_minutes: number;
  return_open_before_minutes: number;
  exit_open_before_minutes: number;
  overtime_threshold_minutes: number;
  effective_from: string;
  effective_until: string | null;
};
export type SchedulePolicyInput = Omit<WorkSchedule, 'id' | 'version_id' | 'version' | 'status' | 'effective_until'>;
export type RrhhCatalogs = { sites: Site[]; roles: JobRole[]; schedules: WorkSchedule[]; geofences: Geofence[] };

export type WorkCalendarEventType = 'FERIADO' | 'DIA_NO_LABORABLE' | 'JORNADA_ESPECIAL';
export type WorkCalendarEvent = {
  id: number;
  scope: 'EMPRESA' | 'SEDE';
  site_id: number | null;
  site_name: string | null;
  name: string;
  type: WorkCalendarEventType;
  start_date: string;
  end_date: string;
  schedule_id: number | null;
  schedule_name: string | null;
  description: string | null;
  status: 'ACTIVO' | 'CANCELADO';
  created_at: string;
};
export type WorkCalendarInput = Pick<WorkCalendarEvent,
  'scope' | 'site_id' | 'name' | 'type' | 'start_date' | 'end_date' | 'schedule_id' | 'description'>;

export type HolidayProposalDecision = 'NO_LABORABLE' | 'JORNADA_NORMAL' | 'JORNADA_ESPECIAL' | 'DESCARTAR';
export type HolidayProposal = {
  id: number;
  provider: string;
  external_key: string;
  date: string;
  local_name: string;
  international_name: string | null;
  source_type: string;
  is_national: boolean;
  subdivisions: string[];
  source_url: string;
  status: 'PENDIENTE' | 'APROBADA' | 'DESCARTADA';
  decision: HolidayProposalDecision | null;
  calendar_event_id: number | null;
  decision_comment: string | null;
  decided_by: number | null;
  decided_at: string | null;
  synced_at: string;
};
export type HolidayProposalDecisionInput = {
  decision: HolidayProposalDecision;
  scope: 'EMPRESA' | 'SEDE';
  site_id: number | null;
  schedule_id: number | null;
  comment: string;
};
export type HolidaySyncResult = {
  summary: { provider: string; year: number; received: number; inserted: number; refreshed: number };
  proposals: HolidayProposal[];
};

export type EmployeeInput = {
  sede_id: number;
  cargo_id: number;
  dni: string;
  ruc: string;
  nombres: string;
  apellidos: string;
  sexo: EmployeeGender;
  telefono: string;
  email: string;
  direccion: string;
  fecha_ingreso: string;
  tipo_rastreo: EmployeeTracking;
  estado: EmployeeStatus;
  observaciones: string;
};

export type DniLookupResult = {
  dni: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  apellidos: string;
  direccion: string;
  ruc: string | null;
  rucStatus: 'FOUND' | 'NOT_FOUND' | 'UNAVAILABLE';
};

export type Geofence = {
  site_id: number;
  site_name?: string;
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

export type WeeklySchedulePolicy = {
  requested_scope: 'EMPRESA' | 'SEDE';
  source_scope: 'EMPRESA' | 'SEDE' | null;
  inherited: boolean;
  site_id: number | null;
  assignments: ScheduleAssignment[];
};

export type ActivationCredentials = {
  password: string;
  activation_code: string;
  expires_in_seconds: number;
};

export type AttendanceDashboardEmployee = {
  employee_id: number;
  site_id: number;
  site_name: string;
  employee_code: string;
  names: string;
  last_names: string;
  job_role: string;
  attendance_id: number | null;
  status: 'PRESENTE' | 'TARDANZA' | 'FALTA' | 'PERMISO' | 'VACACIONES' | 'SIN_REGISTRO' | 'NO_LABORABLE';
  delay_minutes: number;
  return_delay_minutes: number;
  overtime_minutes: number;
  overtime_detected_minutes?: number;
  overtime_pending_minutes?: number;
  overtime_review_pending?: boolean;
  operational_status: 'NO_LABORABLE' | 'PERMISO' | 'VACACIONES' | 'FALTA' | 'PROGRAMADO'
    | 'PENDIENTE_ENTRADA' | 'ENTRADA_RETRASADA' | 'EN_JORNADA' | 'EN_ALMUERZO'
    | 'REGRESO_RETRASADO' | 'SALIDA_PENDIENTE' | 'JORNADA_COMPLETADA' | 'JORNADA_INCOMPLETA';
  next_action: 'NINGUNA' | 'MARCAR_ENTRADA' | 'MARCAR_SALIDA_ALMUERZO' | 'MARCAR_REGRESO'
    | 'MARCAR_SALIDA' | 'REVISAR_INCIDENCIA';
  requires_attention: boolean;
  completed_marks: number;
  expected_marks: 2 | 4;
  schedule: {
    name: string;
    start_time: string;
    end_time: string;
    tolerance_minutes: number;
    lunch_enabled: boolean;
    lunch_start_from: string | null;
    lunch_start_until: string | null;
    lunch_duration_minutes: number;
    return_tolerance_minutes: number;
  } | null;
  marks: { entry: string | null; lunch_out: string | null; lunch_return: string | null; exit: string | null };
  justification?: null | {
    id: number;
    status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';
    incident_type: 'TARDANZA' | 'INASISTENCIA';
    category: 'MEDICO' | 'EMERGENCIA_FAMILIAR' | 'TRANSPORTE' | 'OTRO';
    resolution_comment: string | null;
    resolved_at: string | null;
  };
};

export type AttendanceDashboard = {
  date: string;
  scope: 'EMPRESA' | 'SEDE';
  site_id: number | null;
  summary: {
    total_employees: number;
    present: number;
    on_time: number;
    late: number;
    without_record: number;
    authorized_absence: number;
    non_working: number;
    completed: number;
    overtime_minutes: number;
    justified_incidents?: number;
    pending_justifications?: number;
    rejected_justifications?: number;
  };
  work_day: {
    working: boolean;
    reason: 'REGULAR' | WorkCalendarEventType;
    name: string | null;
    scope: 'EMPRESA' | 'SEDE' | null;
  } | null;
  employees: AttendanceDashboardEmployee[];
};

export type AttendanceTrendPoint = {
  date: string;
  working_employees: number;
  present: number;
  late: number;
  absences: number;
  authorized_absences: number;
  attendance_rate: number | null;
  tardiness_rate: number | null;
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
  evidence_status: 'ACTIVA' | 'PENDIENTE_ELIMINACION' | 'ELIMINADA';
  evidence_deleted_at: string | null;
  evidence_available: boolean;
  created_at: string;
  employee_code: string;
  employee_names: string;
  employee_last_names: string;
  employee_sex: EmployeeGender;
  employee_photo: string | null;
  job_role: string;
  site_name: string;
};

export type PermissionRequest = {
  id: number;
  empleado_id: number;
  tipo_permiso: 'MEDICO' | 'PERSONAL' | 'FAMILIAR' | 'OTRO';
  fecha_inicio: string;
  fecha_fin: string;
  motivo: string;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'CANCELADO';
  comentario_resolucion: string | null;
  resuelto_en: string | null;
  motivo_cancelacion: string | null;
  cancelado_en: string | null;
  origen_solicitud: 'ADMIN' | 'MOVIL';
  tiene_sustento: number | boolean;
  sustento_nombre: string | null;
  puede_cancelar: number | boolean;
  created_at: string;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  cargo_nombre: string;
  sede_id: number;
  sede_nombre: string;
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
  motivo_cancelacion: string | null;
  cancelado_en: string | null;
  puede_cancelar: number | boolean;
  created_at: string;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  cargo_nombre: string;
  sede_id: number;
  sede_nombre: string;
};

export type AttendanceJustificationRequest = {
  id: number;
  asistencia_id: number;
  empleado_id: number;
  tipo_incidencia: 'TARDANZA' | 'INASISTENCIA';
  categoria: 'MEDICO' | 'EMERGENCIA_FAMILIAR' | 'TRANSPORTE' | 'OTRO';
  motivo: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';
  origen: 'MOVIL' | 'ADMIN';
  comentario_revision: string | null;
  revisado_en: string | null;
  cancelado_en: string | null;
  created_at: string;
  fecha_incidencia: string;
  estado_asistencia: string;
  minutos_tardanza: number;
  tiene_sustento: number | boolean;
  sustento_nombre: string | null;
  codigo_empleado: string;
  nombres: string;
  apellidos: string;
  sexo: EmployeeGender;
  foto: string | null;
  cargo_nombre: string;
  sede_id: number;
  sede_nombre: string;
};

export type AbsenceWorkflows = {
  permissions: PermissionRequest[];
  vacations: VacationRequest[];
  justifications: AttendanceJustificationRequest[];
};

export type AttendanceCorrectionInput = {
  sede_id: number;
  employee_id: number;
  date: string;
  status: Exclude<AttendanceDashboardEmployee['status'], 'SIN_REGISTRO' | 'NO_LABORABLE'>;
  reason: string;
  marks: Record<'ENTRADA' | 'SALIDA_ALMUERZO' | 'REGRESO' | 'SALIDA', string | null>;
};

export type AttendanceDetailMark = {
  id: number;
  tipo_marcacion: 'ENTRADA' | 'SALIDA_ALMUERZO' | 'REGRESO' | 'SALIDA';
  hora_marcacion: string;
  hora_programada: string | null;
  diferencia_programada_minutos: number | null;
  clasificacion_tiempo: string | null;
  origen_marcacion: string;
  dentro_de_radio: number | boolean | null;
  distancia_sede_metros: number | null;
  precision_gps: number | null;
  verificacion_identidad: string | null;
  dispositivo_id: number | null;
};

export type OvertimeRequest = {
  id: number;
  marcacion_id: number | null;
  tipo_evento: 'ALMUERZO_DIFERIDO' | 'SALIDA_POSTERIOR';
  origen: 'DETECCION_AUTOMATICA' | 'DECLARACION_EMPLEADO';
  minutos_detectados: number;
  minutos_aprobados: number | null;
  umbral_aplicado_minutos: number;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  comentario_empleado: string | null;
  declarado_en: string | null;
  tiene_sustento: number | boolean;
  sustento_nombre: string | null;
  comentario_revision: string | null;
  revisado_en: string | null;
  revisado_por_nombre: string | null;
};

export type AttendanceDetail = {
  date: string;
  employee: {
    id: number;
    codigo_empleado: string;
    nombres: string;
    apellidos: string;
    foto: string | null;
    cargo: string;
    sede_id: number;
    sede: string;
  };
  attendance: null | {
    id: number;
    fecha: string;
    estado_asistencia: AttendanceDashboardEmployee['status'];
    tipo_asistencia: string;
    minutos_tardanza: number;
    minutos_tardanza_retorno: number;
    horario: string | null;
    hora_entrada: string | null;
    hora_salida: string | null;
    tolerancia_entrada_minutos: number | null;
    almuerzo_habilitado: number | boolean | null;
    salida_almuerzo_desde: string | null;
    salida_almuerzo_hasta: string | null;
    duracion_almuerzo_minutos: number | null;
    tolerancia_retorno_minutos: number | null;
    umbral_sobretiempo_minutos: number | null;
  };
  marks: AttendanceDetailMark[];
  overtime_requests: OvertimeRequest[];
  corrections: Array<{ id: number; motivo: string; created_at: string; corregido_por_nombre: string }>;
  incident_reviews: Array<{
    id: number;
    tipo_incidencia: string;
    decision: string;
    comentario: string;
    revisado_en: string;
    revisado_por_nombre: string;
  }>;
};

export type EmployeeAttendanceReportMode = 'WEEK' | 'MONTH';

export type EmployeeAttendanceReportDayStatus =
  | 'PRESENTE' | 'TARDANZA' | 'FALTA' | 'PERMISO' | 'VACACIONES'
  | 'SIN_REGISTRO' | 'NO_LABORABLE' | 'PROGRAMADO' | 'FUERA_VINCULO';

export type EmployeeAttendanceReportDay = {
  date: string;
  status: EmployeeAttendanceReportDayStatus;
  scheduled: boolean;
  is_future: boolean;
  attendance_id: number | null;
  attendance_type: string | null;
  delay_minutes: number;
  return_delay_minutes: number;
  overtime_minutes: number;
  marks: { entry: string | null; lunch_out: string | null; lunch_return: string | null; exit: string | null };
  justification: null | {
    id: number;
    status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA';
    incident_type: string;
    category: string;
    review_comment: string | null;
  };
};

export type EmployeeAttendanceReport = {
  period: {
    mode: EmployeeAttendanceReportMode;
    anchor: string;
    start_date: string;
    end_date: string;
  };
  employee: {
    id: number;
    codigo_empleado: string;
    nombres: string;
    apellidos: string;
    foto: string | null;
    cargo: string;
    sede_id: number;
    sede: string;
    fecha_ingreso: string;
    fecha_cese: string | null;
  };
  summary: {
    scheduled_days: number;
    attended_days: number;
    on_time_days: number;
    late_days: number;
    absent_days: number;
    authorized_days: number;
    without_record_days: number;
    justified_incidents: number;
    pending_justifications: number;
    delay_minutes: number;
    overtime_minutes: number;
    attendance_rate: number;
    punctuality_rate: number;
  };
  days: EmployeeAttendanceReportDay[];
};

export type ServicePaymentStatus =
  | 'PREVISUALIZACION'
  | 'CONFIGURACION_PENDIENTE'
  | 'BORRADOR'
  | 'OBSERVADO'
  | 'LISTO_PARA_PAGO'
  | 'EN_REVISION'
  | 'APROBADO'
  | 'EN_LOTE'
  | 'PAGADO';

export type ServicePaymentQueue =
  | 'POR_REVISAR'
  | 'OBSERVADOS'
  | 'LISTOS_PARA_PAGO'
  | 'EN_PAGO'
  | 'PAGADOS';

export type ServicePaymentControlCode =
  | 'AGREEMENT'
  | 'OVERTIME_RATE'
  | 'BANK_ACCOUNT'
  | 'CALCULATION'
  | 'HONOR_RECEIPT'
  | 'DEPOSIT';

export type ServicePaymentControls = {
  items: Array<{
    code: ServicePaymentControlCode;
    state: 'READY' | 'PENDING' | 'NOT_REQUIRED';
  }>;
  pending_for_review: ServicePaymentControlCode[];
  pending_for_batch: ServicePaymentControlCode[];
  ready_for_review: boolean;
  ready_for_batch: boolean;
  payment_completed: boolean;
};

export type ServicePaymentRow = {
  id: number | null;
  acuerdo_configurado_id?: number | null;
  acuerdo_vigente_desde?: string | null;
  acuerdo_vigente_hasta?: string | null;
  acuerdo_actual_id?: number | null;
  acuerdo_actual_pago_mensual?: number | string | null;
  acuerdo_actual_politica_prorrateo?: 'DIAS_CALENDARIO' | 'HONORARIO_COMPLETO' | null;
  acuerdo_actual_tarifa_hora_extra?: number | string | null;
  acuerdo_actual_banco?: string | null;
  acuerdo_actual_tipo_cuenta?: 'AHORROS' | 'CORRIENTE' | null;
  acuerdo_actual_numero_cuenta_ultimos4?: string | null;
  acuerdo_actual_cci_ultimos4?: string | null;
  acuerdo_actual_vigente_desde?: string | null;
  acuerdo_actual_vigente_hasta?: string | null;
  empleado_id: number;
  sede_id: number;
  codigo_empleado: string;
  dni: string;
  nombres: string;
  apellidos: string;
  sexo: EmployeeGender;
  foto: string | null;
  cargo: string;
  sede: string;
  pago_mensual: number | string;
  honorario_mensual_pactado: number | string;
  politica_prorrateo: 'DIAS_CALENDARIO' | 'HONORARIO_COMPLETO';
  prorrateo_aplicado: number | boolean;
  dias_periodo: number;
  dias_servicio: number;
  fecha_servicio_desde: string | null;
  fecha_servicio_hasta: string | null;
  factor_prorrateo: number | string;
  tarifa_hora_extra: number | string;
  minutos_horas_extra: number;
  monto_horas_extra: number | string;
  otros_ingresos: number | string;
  adelantos: number | string;
  cuotas_prestamo: number | string;
  otros_descuentos: number | string;
  total_servicio: number | string;
  total_depositar: number | string;
  estado: ServicePaymentStatus;
  rhe_serie: string | null;
  rhe_numero: string | null;
  rhe_fecha_emision: string | null;
  rhe_importe: number | string | null;
  pago_fecha: string | null;
  pago_operacion: string | null;
  banco: string | null;
  tipo_cuenta: 'AHORROS' | 'CORRIENTE' | null;
  numero_cuenta_ultimos4: string | null;
  cci_ultimos4: string | null;
  observacion: string | null;
  queue: ServicePaymentQueue;
  controls: ServicePaymentControls;
};

export type ServicePaymentDashboard = {
  period: null | {
    id: number;
    estado: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'EN_PAGO' | 'PAGADO' | 'CERRADO';
    periodo: string;
    enviado_revision_en: string | null;
    aprobado_en: string | null;
    cerrado_en: string | null;
    observacion: string | null;
    created_at: string;
    updated_at: string;
  };
  month: string;
  summary: {
    collaborators: number;
    service_total: number;
    overtime_total: number;
    deductions_total: number;
    deposit_total: number;
    paid: number;
    pending_configuration: number;
    pending_receipts: number;
    observed: number;
    approved: number;
    in_batch: number;
    queues: Record<ServicePaymentQueue, number>;
  };
  payments: ServicePaymentRow[];
  batches: Array<{
    id: number;
    codigo: string;
    estado: 'BORRADOR' | 'EN_PROCESO' | 'PAGADO' | 'CANCELADO';
    cantidad_pagos: number;
    total_depositar: number | string;
    pagos_confirmados: number;
    created_at: string;
    procesado_en: string | null;
  }>;
};

export type ServicePaymentHistoryRow = {
  id: number;
  month: string;
  estado: 'BORRADOR' | 'EN_REVISION' | 'APROBADO' | 'EN_PAGO' | 'PAGADO' | 'CERRADO';
  collaborators: number;
  service_total: number | string;
  overtime_total: number | string;
  income_total: number | string;
  deductions_total: number | string;
  deposit_total: number | string;
  paid_total: number | string;
  pending_total: number | string;
  paid_collaborators: number;
  receipts_registered: number;
  observed_collaborators: number;
  enviado_revision_en: string | null;
  aprobado_en: string | null;
  cerrado_en: string | null;
  created_at: string;
  updated_at: string;
};

export type ServicePaymentHistory = {
  year: number;
  available_years: number[];
  summary: {
    periods: number;
    closed: number;
    deposit_total: number;
    paid_total: number;
    pending_total: number;
  };
  periods: ServicePaymentHistoryRow[];
};

export type ServicePaymentEmployeeLedger = {
  month: string;
  employee: {
    id: number;
    codigo_empleado: string;
    dni: string;
    nombres: string;
    apellidos: string;
    sexo: EmployeeGender;
    foto: string | null;
    fecha_ingreso: string;
    fecha_cese: string | null;
    estado: string;
    cargo: string;
    sede_id: number;
    sede: string;
    pago_mensual: number | string | null;
    politica_prorrateo: 'DIAS_CALENDARIO' | 'HONORARIO_COMPLETO' | null;
    tarifa_hora_extra: number | string | null;
    banco: string | null;
    tipo_cuenta: 'AHORROS' | 'CORRIENTE' | null;
    numero_cuenta_ultimos4: string | null;
    cci_ultimos4: string | null;
  };
  period: ServicePaymentDashboard['period'];
  liquidation: null | {
    id: number;
    pago_mensual: number | string;
    honorario_mensual_pactado: number | string;
    politica_prorrateo: 'DIAS_CALENDARIO' | 'HONORARIO_COMPLETO';
    prorrateo_aplicado: number | boolean;
    dias_periodo: number;
    dias_servicio: number;
    fecha_servicio_desde: string | null;
    fecha_servicio_hasta: string | null;
    factor_prorrateo: number | string;
    minutos_horas_extra: number;
    monto_horas_extra: number | string;
    otros_ingresos: number | string;
    adelantos: number | string;
    cuotas_prestamo: number | string;
    otros_descuentos: number | string;
    total_servicio: number | string;
    total_depositar: number | string;
    estado: ServicePaymentStatus;
    rhe_serie: string | null;
    rhe_numero: string | null;
    rhe_fecha_emision: string | null;
    rhe_importe: number | string | null;
    pago_fecha: string | null;
    pago_operacion: string | null;
    observacion: string | null;
    lote_codigo: string | null;
    lote_detalle_estado: string | null;
    lote_operacion: string | null;
    lote_pagado_en: string | null;
  };
  payment_preview: null | {
    agreedMonthlyPayment: number;
    appliedMonthlyPayment: number;
    periodDays: number;
    serviceDays: number;
    serviceStart: string | null;
    serviceEnd: string | null;
    factor: number;
    prorated: boolean;
    partialPeriod: boolean;
    policy: 'DIAS_CALENDARIO' | 'HONORARIO_COMPLETO';
  };
  concepts: Array<{
    id: number;
    tipo: string;
    descripcion: string;
    monto: number | string;
    cantidad: number | string | null;
    unidad: string | null;
    created_at: string;
  }>;
  attendance: Array<{
    fecha: string;
    estado_asistencia: string;
    tipo_asistencia: string;
    minutos_tardanza: number;
    minutos_tardanza_retorno: number;
    minutos_horas_extra: number;
    justificacion_estado?: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA' | null;
    justificacion_tipo_incidencia?: 'TARDANZA' | 'INASISTENCIA' | null;
    justificacion_categoria?: 'MEDICO' | 'EMERGENCIA_FAMILIAR' | 'TRANSPORTE' | 'OTRO' | null;
    justificacion_comentario_revision?: string | null;
    justificacion_revisada_en?: string | null;
  }>;
  attendance_summary: {
    records: number;
    attended: number;
    late: number;
    absent: number;
    justified: number;
    pending_justifications?: number;
    justified_late?: number;
    justified_absence?: number;
    unjustified_late?: number;
    unjustified_absence?: number;
    delay_minutes: number;
    overtime_minutes: number;
  };
  movements: Array<{
    id: number;
    tipo: string;
    concepto: string;
    monto: number | string;
    estado: string;
    created_at: string;
    aplicado_en: string | null;
  }>;
  loans: Array<{
    id: number;
    concepto: string;
    monto_original: number | string;
    saldo_pendiente: number | string;
    cuota_mensual: number | string;
    periodo_inicio: string;
    estado: string;
    created_at: string;
  }>;
  notes: Array<{
    id: number;
    nota: string;
    monto_referencial: number | string | null;
    estado: 'ACTIVA' | 'ANULADA';
    motivo_anulacion: string | null;
    created_at: string;
    anulado_en: string | null;
    creado_por_nombre: string;
    anulado_por_nombre: string | null;
  }>;
  timeline: Array<{
    estado_anterior: string | null;
    estado_nuevo: string;
    motivo: string | null;
    created_at: string;
    usuario: string | null;
  }>;
  controls: ServicePaymentControls;
};
