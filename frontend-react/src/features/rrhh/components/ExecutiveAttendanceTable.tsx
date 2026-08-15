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
import type { AttendanceDashboardEmployee } from '../types';
import styles from '../Rrhh.module.css';
import { ATTENDANCE_STATUS_LABELS, formatAttendanceClock } from './attendance-formatters';

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
  emptyMessage: string;
};

function AttendanceState({ status }: { status: AttendanceDashboardEmployee['status'] }) {
  const Icon = STATUS_ICONS[status];

  return (
    <span className={`${styles.attendanceStatus} ${styles[`attendance${status}`]}`}>
      <Icon aria-hidden="true" />
      {ATTENDANCE_STATUS_LABELS[status]}
    </span>
  );
}

function EmployeeRow({ employee }: { employee: AttendanceDashboardEmployee }) {
  const delay = employee.delay_minutes;
  const overtime = employee.overtime_minutes;

  return (
    <tr>
      <td>
        <div className={styles.person}>
          <span aria-hidden="true"><UserRound /></span>
          <div><strong title={`${employee.names} ${employee.last_names}`}>{employee.names} {employee.last_names}</strong></div>
        </div>
      </td>
      <td className={styles.attendanceSiteCell} title={employee.site_name}>{employee.site_name}</td>
      <td className={styles.attendanceRoleCell} title={employee.job_role}>{employee.job_role}</td>
      <td className={styles.clockCell}>{formatAttendanceClock(employee.marks.entry)}</td>
      <td className={styles.clockCell}>{formatAttendanceClock(employee.marks.lunch_out)}</td>
      <td className={styles.clockCell}>{formatAttendanceClock(employee.marks.lunch_return)}</td>
      <td className={styles.clockCell}>{formatAttendanceClock(employee.marks.exit)}</td>
      <td><AttendanceState status={employee.status} /></td>
      <td className={delay ? styles.attendanceDelay : styles.attendanceEmptyValue}>{delay ? `${delay} min` : '—'}</td>
      <td className={overtime ? styles.attendanceOvertime : styles.attendanceEmptyValue}>{overtime ? `${overtime} min` : '—'}</td>
    </tr>
  );
}

export function ExecutiveAttendanceTable({ employees, emptyMessage }: Props) {
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
          {employees.map(employee => <EmployeeRow key={employee.employee_id} employee={employee} />)}
          {!employees.length && <tr><td colSpan={10}><div className={styles.empty}>{emptyMessage}</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}
