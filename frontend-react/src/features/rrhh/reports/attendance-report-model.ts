import type {
  AbsenceWorkflows,
  AttendanceDashboard,
  AttendanceDashboardEmployee,
  AttendanceTrendPoint,
  Employee,
} from '../types';
import { ATTENDANCE_STATUS_LABELS, formatAttendanceClock } from '../components/attendance-formatters';

export type AttendanceReportInput = {
  attendance: AttendanceDashboard;
  trend: AttendanceTrendPoint[];
  workflows: AbsenceWorkflows | null;
  employees: Employee[];
  scopeLabel: string;
  generatedAt?: Date;
};

export type AttendanceReportDetail = {
  number: number;
  employeeCode: string;
  document: string;
  employee: string;
  role: string;
  site: string;
  schedule: string;
  entry: string;
  lunchOut: string;
  lunchReturn: string;
  exit: string;
  status: string;
  delayMinutes: number;
  overtimeMinutes: number;
  observations: string;
};

export type AttendanceSiteSummary = {
  site: string;
  employees: number;
  withAttendance: number;
  onTime: number;
  late: number;
  absent: number;
  authorizedAbsence: number;
  attendanceRate: number;
  overtimeMinutes: number;
};

export type AttendanceStatusSummary = {
  status: string;
  count: number;
  percentage: number;
};

export type AttendanceRequestRow = {
  type: string;
  employee: string;
  code: string;
  site: string;
  startDate: string;
  endDate: string;
  status: string;
  reason: string;
};

export type AttendanceReportModel = {
  reportDate: string;
  generatedAt: Date;
  scopeLabel: string;
  kpis: {
    employees: number;
    withAttendance: number;
    attendanceRate: number;
    late: number;
    absent: number;
    authorizedAbsence: number;
    overtimeMinutes: number;
  };
  detail: AttendanceReportDetail[];
  sites: AttendanceSiteSummary[];
  statuses: AttendanceStatusSummary[];
  trend: AttendanceTrendPoint[];
  requests: AttendanceRequestRow[];
};

const REPORT_STATUSES: AttendanceDashboardEmployee['status'][] = [
  'PRESENTE',
  'TARDANZA',
  'FALTA',
  'SIN_REGISTRO',
  'PERMISO',
  'VACACIONES',
  'NO_LABORABLE',
];

function isAttendance(status: AttendanceDashboardEmployee['status']) {
  return status === 'PRESENTE' || status === 'TARDANZA';
}

function isAuthorizedAbsence(status: AttendanceDashboardEmployee['status']) {
  return status === 'PERMISO' || status === 'VACACIONES';
}

function observationFor(item: AttendanceDashboardEmployee, employee?: Employee) {
  if (employee?.observaciones?.trim()) return employee.observaciones.trim();
  if (item.status === 'SIN_REGISTRO') return 'Sin marcación de entrada';
  if (item.status === 'FALTA') return 'Ausencia sin marcación';
  if (item.status === 'PERMISO' || item.status === 'VACACIONES') return ATTENDANCE_STATUS_LABELS[item.status];
  return '';
}

export function buildAttendanceReportModel(input: AttendanceReportInput): AttendanceReportModel {
  const directory = new Map(input.employees.map(employee => [employee.id, employee]));
  const total = input.attendance.employees.length;
  const withAttendance = input.attendance.employees.filter(item => isAttendance(item.status)).length;
  const late = input.attendance.employees.filter(item => item.status === 'TARDANZA').length;
  const absent = input.attendance.employees.filter(item => item.status === 'FALTA' || item.status === 'SIN_REGISTRO').length;
  const authorizedAbsence = input.attendance.employees.filter(item => isAuthorizedAbsence(item.status)).length;
  const overtimeMinutes = input.attendance.employees.reduce((sum, item) => sum + item.overtime_minutes, 0);

  const detail = input.attendance.employees.map<AttendanceReportDetail>((item, index) => {
    const employee = directory.get(item.employee_id);
    return {
      number: index + 1,
      employeeCode: item.employee_code,
      document: employee?.dni ?? '',
      employee: `${item.names} ${item.last_names}`.trim(),
      role: item.job_role,
      site: item.site_name,
      schedule: item.schedule?.name ?? 'Sin horario',
      entry: formatAttendanceClock(item.marks.entry),
      lunchOut: formatAttendanceClock(item.marks.lunch_out),
      lunchReturn: formatAttendanceClock(item.marks.lunch_return),
      exit: formatAttendanceClock(item.marks.exit),
      status: ATTENDANCE_STATUS_LABELS[item.status],
      delayMinutes: item.delay_minutes,
      overtimeMinutes: item.overtime_minutes,
      observations: observationFor(item, employee),
    };
  });

  const bySite = new Map<string, AttendanceDashboardEmployee[]>();
  input.attendance.employees.forEach(item => bySite.set(item.site_name, [...(bySite.get(item.site_name) ?? []), item]));
  const sites = [...bySite.entries()].map<AttendanceSiteSummary>(([site, items]) => {
    const siteWithAttendance = items.filter(item => isAttendance(item.status)).length;
    return {
      site,
      employees: items.length,
      withAttendance: siteWithAttendance,
      onTime: items.filter(item => item.status === 'PRESENTE').length,
      late: items.filter(item => item.status === 'TARDANZA').length,
      absent: items.filter(item => item.status === 'FALTA' || item.status === 'SIN_REGISTRO').length,
      authorizedAbsence: items.filter(item => isAuthorizedAbsence(item.status)).length,
      attendanceRate: items.length ? siteWithAttendance / items.length : 0,
      overtimeMinutes: items.reduce((sum, item) => sum + item.overtime_minutes, 0),
    };
  }).sort((left, right) => left.site.localeCompare(right.site, 'es'));

  const statuses = REPORT_STATUSES.map<AttendanceStatusSummary>(status => {
    const count = input.attendance.employees.filter(item => item.status === status).length;
    return { status: ATTENDANCE_STATUS_LABELS[status], count, percentage: total ? count / total : 0 };
  }).filter(item => item.count > 0);

  const permissionRows = input.workflows?.permissions.map<AttendanceRequestRow>(item => ({
    type: `Permiso ${item.tipo_permiso.toLocaleLowerCase('es')}`,
    employee: `${item.nombres} ${item.apellidos}`,
    code: item.codigo_empleado,
    site: item.sede_nombre,
    startDate: item.fecha_inicio,
    endDate: item.fecha_fin,
    status: item.estado,
    reason: item.motivo,
  })) ?? [];
  const vacationRows = input.workflows?.vacations.map<AttendanceRequestRow>(item => ({
    type: 'Vacaciones',
    employee: `${item.nombres} ${item.apellidos}`,
    code: item.codigo_empleado,
    site: item.sede_nombre,
    startDate: item.fecha_inicio,
    endDate: item.fecha_fin,
    status: item.estado,
    reason: item.motivo ?? '',
  })) ?? [];

  return {
    reportDate: input.attendance.date,
    generatedAt: input.generatedAt ?? new Date(),
    scopeLabel: input.scopeLabel,
    kpis: {
      employees: total,
      withAttendance,
      attendanceRate: total ? withAttendance / total : 0,
      late,
      absent,
      authorizedAbsence,
      overtimeMinutes,
    },
    detail,
    sites,
    statuses,
    trend: [...input.trend].sort((left, right) => left.date.localeCompare(right.date)),
    requests: [...permissionRows, ...vacationRows].sort((left, right) => left.startDate.localeCompare(right.startDate)),
  };
}
