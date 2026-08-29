import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Coffee, LogOut,
  ShieldCheck, Timer, UserRound, X,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { rrhhService } from '../rrhh.service';
import type {
  Employee, EmployeeAttendanceReport, EmployeeAttendanceReportDay,
  EmployeeAttendanceReportDayStatus, EmployeeAttendanceReportMode,
} from '../types';
import { formatDurationMinutes } from './attendance-formatters';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';
import styles from './EmployeeAttendanceReportModal.module.css';

const STATUS: Record<EmployeeAttendanceReportDayStatus, { label: string; short: string; tone: string }> = {
  PRESENTE: { label: 'Asistencia puntual', short: 'Asistió', tone: 'present' },
  TARDANZA: { label: 'Asistencia con tardanza', short: 'Tardanza', tone: 'late' },
  FALTA: { label: 'Falta registrada', short: 'Falta', tone: 'absent' },
  PERMISO: { label: 'Permiso autorizado', short: 'Permiso', tone: 'authorized' },
  VACACIONES: { label: 'Vacaciones', short: 'Vacaciones', tone: 'vacation' },
  SIN_REGISTRO: { label: 'Sin marcación', short: 'Sin registro', tone: 'missing' },
  NO_LABORABLE: { label: 'Día no laborable', short: 'Descanso', tone: 'off' },
  PROGRAMADO: { label: 'Jornada programada', short: 'Programado', tone: 'scheduled' },
  FUERA_VINCULO: { label: 'Fuera del vínculo laboral', short: 'No aplica', tone: 'off' },
};

function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function parseDate(value: string) { return new Date(`${value}T12:00:00Z`); }

function shiftPeriod(value: string, mode: EmployeeAttendanceReportMode, amount: number) {
  const date = parseDate(value);
  if (mode === 'MONTH') date.setUTCMonth(date.getUTCMonth() + amount, 1);
  else date.setUTCDate(date.getUTCDate() + (amount * 7));
  return date.toISOString().slice(0, 10);
}

function periodLabel(report: EmployeeAttendanceReport) {
  if (report.period.mode === 'MONTH') {
    const text = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parseDate(report.period.start_date));
    return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
  }
  const formatter = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${formatter.format(parseDate(report.period.start_date))} – ${formatter.format(parseDate(report.period.end_date))}`;
}

function dayLabel(value: string) {
  const text = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(parseDate(value));
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}

function formatClock(value: string | null) {
  if (!value) return '—';
  const [hourText, minute = '00'] = value.split(':');
  const hour = Number(hourText);
  if (!Number.isInteger(hour)) return value;
  const suffix = hour >= 12 ? 'p. m.' : 'a. m.';
  const normalized = hour % 12 || 12;
  return `${normalized}:${minute} ${suffix}`;
}

function firstGridOffset(date: string) {
  return parseDate(date).getUTCDay();
}

function DayDetail({ day }: { day: EmployeeAttendanceReportDay }) {
  const status = STATUS[day.status];
  return <section className={styles.dayDetail} aria-label={`Detalle del ${day.date}`}>
    <header>
      <div><small>Jornada seleccionada</small><strong>{dayLabel(day.date)}</strong></div>
      <span className={`${styles.detailStatus} ${styles[status.tone]}`}>{status.label}</span>
    </header>
    <div className={styles.marks}>
      <div><span><Clock3 /></span><small>Entrada</small><strong>{formatClock(day.marks.entry)}</strong></div>
      <div><span><Coffee /></span><small>Salida almuerzo</small><strong>{formatClock(day.marks.lunch_out)}</strong></div>
      <div><span><Coffee /></span><small>Regreso</small><strong>{formatClock(day.marks.lunch_return)}</strong></div>
      <div><span><LogOut /></span><small>Salida final</small><strong>{formatClock(day.marks.exit)}</strong></div>
    </div>
    <footer>
      <span><Timer />Tardanza: <strong>{formatDurationMinutes(day.delay_minutes + day.return_delay_minutes)}</strong></span>
      <span><Clock3 />Horas extra: <strong>{formatDurationMinutes(day.overtime_minutes)}</strong></span>
      {day.justification && <span className={styles.justification}><ShieldCheck />Justificación: <strong>{day.justification.status === 'APROBADA' ? 'Aprobada' : day.justification.status === 'PENDIENTE' ? 'Por revisar' : 'No aprobada'}</strong></span>}
    </footer>
  </section>;
}

export function EmployeeAttendanceReportModal({ employees, initialEmployeeId, onClose }: {
  employees: Employee[];
  initialEmployeeId: number | null;
  onClose: () => void;
}) {
  const [employeeId, setEmployeeId] = useState<number | null>(initialEmployeeId ?? employees[0]?.id ?? null);
  const [mode, setMode] = useState<EmployeeAttendanceReportMode>('MONTH');
  const [anchor, setAnchor] = useState(businessToday());
  const [report, setReport] = useState<EmployeeAttendanceReport | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const selectedEmployee = employees.find(employee => employee.id === employeeId) ?? null;

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!selectedEmployee) return;
    setLoading(true);
    setError(null);
    try {
      const data = await rrhhService.getEmployeeAttendanceReport(selectedEmployee.sedeId, selectedEmployee.id, mode, anchor, signal);
      setReport(data);
      setSelectedDate(current => current && data.days.some(day => day.date === current)
        ? current
        : data.days.find(day => day.date === businessToday())?.date
          ?? [...data.days].reverse().find(day => day.attendance_id !== null || ['PERMISO', 'VACACIONES', 'FALTA'].includes(day.status))?.date
          ?? data.period.start_date);
    } catch (loadError) {
      if (!axios.isCancel(loadError)) setError(loadError);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [anchor, mode, selectedEmployee]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selectedDay = report?.days.find(day => day.date === selectedDate) ?? null;
  const cells = useMemo(() => {
    if (!report) return [];
    const offset = report.period.mode === 'MONTH' ? firstGridOffset(report.period.start_date) : 0;
    return [...Array.from({ length: offset }, () => null), ...report.days];
  }, [report]);

  return <div className={styles.overlay} role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="employee-attendance-report-title">
      <header className={styles.modalHeader}>
        <div className={styles.titleIcon}><CalendarDays /></div>
        <div><h2 id="employee-attendance-report-title">Historial de asistencia</h2><p>Consulta semanal y mensual por colaborador.</p></div>
        <button type="button" className={styles.close} aria-label="Cerrar historial" onClick={onClose}><X /></button>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.employeeControl}><UserRound /><span><small>Colaborador</small><select aria-label="Colaborador del historial" value={employeeId ?? ''} onChange={event => setEmployeeId(Number(event.target.value))}>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.apellidos}, {employee.nombres} · {employee.sedeNombre}</option>)}</select></span></label>
        <div className={styles.viewSwitch} aria-label="Vista del historial">
          <button type="button" className={mode === 'WEEK' ? styles.active : ''} onClick={() => setMode('WEEK')}>Semanal</button>
          <button type="button" className={mode === 'MONTH' ? styles.active : ''} onClick={() => setMode('MONTH')}>Mensual</button>
        </div>
        <div className={styles.periodControl}>
          <button type="button" aria-label="Periodo anterior" onClick={() => setAnchor(value => shiftPeriod(value, mode, -1))}><ChevronLeft /></button>
          <strong>{report ? periodLabel(report) : 'Consultando…'}</strong>
          <button type="button" aria-label="Periodo siguiente" disabled={shiftPeriod(anchor, mode, 1) > businessToday()} onClick={() => setAnchor(value => shiftPeriod(value, mode, 1))}><ChevronRight /></button>
        </div>
      </div>

      <div className={styles.content}>
        {loading && !report ? <PageLoader compact label="Consultando historial" />
          : error ? <div className={styles.error} role="alert"><p>{getApiErrorMessage(error, 'No se pudo consultar el historial de asistencia.')}</p><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></div>
          : report && selectedEmployee ? <>
            <section className={styles.employeeSummary}>
              <img src={getEmployeePhotoUrl(selectedEmployee)} alt={selectedEmployee.foto ? `Foto de ${selectedEmployee.nombres}` : ''} onError={employeePhotoFallbackHandler(selectedEmployee)} />
              <div><small>{report.employee.codigo_empleado}</small><h3>{report.employee.nombres} {report.employee.apellidos}</h3><p>{report.employee.cargo} · {report.employee.sede}</p></div>
              <dl><div><dt>Asistencia</dt><dd>{report.summary.attendance_rate}%</dd></div><div><dt>Puntualidad</dt><dd>{report.summary.punctuality_rate}%</dd></div></dl>
            </section>

            <section className={styles.metrics} aria-label="Resumen del periodo">
              <div><CheckCircle2 /><span><small>Con asistencia</small><strong>{report.summary.attended_days}</strong></span></div>
              <div><Clock3 /><span><small>Con tardanza</small><strong>{report.summary.late_days}</strong></span></div>
              <div><CalendarDays /><span><small>Faltas</small><strong>{report.summary.absent_days}</strong></span></div>
              <div><ShieldCheck /><span><small>Autorizados</small><strong>{report.summary.authorized_days}</strong></span></div>
              <div><Timer /><span><small>Tardanza acumulada</small><strong>{formatDurationMinutes(report.summary.delay_minutes)}</strong></span></div>
              <div><Clock3 /><span><small>Horas extra aprobadas</small><strong>{formatDurationMinutes(report.summary.overtime_minutes)}</strong></span></div>
            </section>

            <section className={`${styles.calendar} ${mode === 'WEEK' ? styles.weekCalendar : ''}`}>
              <header><strong>{periodLabel(report)}</strong><div className={styles.legend}><span className={styles.present}>Asistió</span><span className={styles.late}>Tardanza</span><span className={styles.absent}>Falta</span><span className={styles.authorized}>Autorizado</span></div></header>
              <div className={styles.weekdays}>{['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => <span key={day}>{day}</span>)}</div>
              <div className={styles.calendarGrid}>{cells.map((day, index) => day ? <button type="button" key={day.date} className={`${styles.day} ${styles[STATUS[day.status].tone]} ${selectedDate === day.date ? styles.selectedDay : ''}`} onClick={() => setSelectedDate(day.date)} aria-label={`${dayLabel(day.date)}: ${STATUS[day.status].label}`}><time>{Number(day.date.slice(-2))}</time>{!['NO_LABORABLE', 'FUERA_VINCULO'].includes(day.status) && <strong>{STATUS[day.status].short}</strong>}{day.status === 'TARDANZA' && <small>{formatDurationMinutes(day.delay_minutes + day.return_delay_minutes)}</small>}</button> : <span className={styles.emptyDay} key={`empty-${index}`} />)}</div>
            </section>

            {selectedDay && <DayDetail day={selectedDay} />}
          </> : <div className={styles.error}>No hay colaboradores disponibles.</div>}
      </div>
    </section>
  </div>;
}
