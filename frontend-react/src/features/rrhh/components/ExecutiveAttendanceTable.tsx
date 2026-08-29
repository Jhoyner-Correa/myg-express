import { useMemo } from 'react';
import {
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  CircleMinus,
  Clock3,
  FileClock,
  UserRound,
  UserX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AttendanceDashboardEmployee, Employee } from '../types';
import styles from '../Rrhh.module.css';
import { ATTENDANCE_STATUS_LABELS, formatAttendanceClock, formatDurationMinutes } from './attendance-formatters';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';

const STATUS_ICONS: Record<AttendanceDashboardEmployee['status'], LucideIcon> = {
  PRESENTE: CheckCircle2,
  TARDANZA: Clock3,
  FALTA: UserX,
  PERMISO: FileClock,
  VACACIONES: CalendarDays,
  SIN_REGISTRO: CircleMinus,
  NO_LABORABLE: CalendarOff,
};

type Props = {
  employees: AttendanceDashboardEmployee[];
  directoryEmployees: Employee[];
  emptyMessage: string;
};

function AttendanceState({ employee }: { employee: AttendanceDashboardEmployee }) {
  const Icon = STATUS_ICONS[employee.status];
  const resolution = employee.justification?.status === 'APROBADA'
    ? 'Justificada'
    : employee.justification?.status === 'PENDIENTE'
      ? 'En revisión'
      : employee.justification?.status === 'RECHAZADA'
        ? 'No aprobada'
        : null;

  return (
    <span className={styles.attendanceStatusStack}>
      <span className={`${styles.attendanceStatus} ${styles[`attendance${employee.status}`]}`}>
        <Icon aria-hidden="true" />
        {ATTENDANCE_STATUS_LABELS[employee.status]}
      </span>
      {resolution && <small className={styles[`attendanceJustification${employee.justification?.status}`]}>{resolution}</small>}
    </span>
  );
}

function EmployeeRow({ employee, directoryEmployee }: { employee: AttendanceDashboardEmployee; directoryEmployee?: Employee }) {
  const delay = employee.delay_minutes;
  const overtime = employee.overtime_minutes;

  return (
    <tr>
      <td>
        <div className={styles.person}>
          {directoryEmployee
            ? <img
                className={styles.attendanceAvatarPill}
                src={getEmployeePhotoUrl(directoryEmployee)}
                alt=""
                loading="lazy"
                onError={employeePhotoFallbackHandler(directoryEmployee)}
              />
            : <span className={styles.avatarPill} aria-hidden="true"><UserRound /></span>}
          <div><strong title={`${employee.names} ${employee.last_names}`}>{employee.names} {employee.last_names}</strong></div>
        </div>
      </td>
      <td className={styles.attendanceSiteCell} title={employee.site_name}>{employee.site_name}</td>
      <td className={styles.attendanceRoleCell} title={employee.job_role}>{employee.job_role}</td>
      <td className={styles.clockCell}>{formatAttendanceClock(employee.marks.entry)}</td>
      <td className={styles.clockCell}>{formatAttendanceClock(employee.marks.lunch_out)}</td>
      <td className={styles.clockCell}>{formatAttendanceClock(employee.marks.lunch_return)}</td>
      <td className={styles.clockCell}>{formatAttendanceClock(employee.marks.exit)}</td>
      <td><AttendanceState employee={employee} /></td>
      <td className={delay ? styles.attendanceDelay : styles.attendanceEmptyValue}>{delay ? <span className={styles.attendanceDelayStack}><strong>{formatDurationMinutes(delay)}</strong>{employee.justification && <small className={styles[`attendanceJustification${employee.justification.status}`]}>{employee.justification.status === 'APROBADA' ? 'Justificada' : employee.justification.status === 'PENDIENTE' ? 'En revisión' : employee.justification.status === 'RECHAZADA' ? 'No aprobada' : 'Cancelada'}</small>}</span> : '—'}</td>
      <td className={overtime ? styles.attendanceOvertime : styles.attendanceEmptyValue}>{overtime ? formatDurationMinutes(overtime) : '—'}</td>
    </tr>
  );
}

export function ExecutiveAttendanceTable({ employees, directoryEmployees, emptyMessage }: Props) {
  const employeeDirectory = useMemo(
    () => new Map(directoryEmployees.map(employee => [employee.id, employee])),
    [directoryEmployees],
  );

  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.executiveAttendanceTable}`} aria-label="Asistencia de hoy">
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Sede</th>
            <th>Cargo</th>
            <th>Entrada</th>
            <th>Salida almuerzo</th>
            <th>Regreso</th>
            <th>Salida final</th>
            <th>Estado</th>
            <th>Tardanza</th>
            <th>Horas extra</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(employee => (
            <EmployeeRow
              key={employee.employee_id}
              employee={employee}
              directoryEmployee={employeeDirectory.get(employee.employee_id)}
            />
          ))}
          {!employees.length && <tr><td colSpan={10}><div className={styles.empty}>{emptyMessage}</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
