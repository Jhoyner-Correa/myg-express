import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CalendarDays, CheckCircle2, ClockAlert, PencilLine, RefreshCw, Search, TimerReset, UserX } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { rrhhService } from '../rrhh.service';
import type { AttendanceDashboard, AttendanceDashboardEmployee } from '../types';
import styles from '../Rrhh.module.css';
import { AttendanceCorrectionModal } from './AttendanceCorrectionModal';

function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function clock(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

const STATUS_LABELS: Record<AttendanceDashboardEmployee['status'], string> = {
  PRESENTE: 'Presente', TARDANZA: 'Tardanza', FALTA: 'Falta', PERMISO: 'Permiso', VACACIONES: 'Vacaciones', SIN_REGISTRO: 'Sin registrar',
};

export function AttendancePanel({ siteId, canManage }: { siteId: number; canManage: boolean }) {
  const [date, setDate] = useState(businessToday);
  const [dashboard, setDashboard] = useState<AttendanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('TODOS');
  const [correcting, setCorrecting] = useState<AttendanceDashboardEmployee | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setDashboard(await rrhhService.getAttendanceDashboard(siteId, date, signal)); }
    catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [date, siteId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const employees = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    return (dashboard?.employees ?? []).filter(employee => {
      const matchesText = !term || `${employee.names} ${employee.last_names} ${employee.employee_code} ${employee.job_role}`.toLocaleLowerCase('es').includes(term);
      return matchesText && (status === 'TODOS' || employee.status === status);
    });
  }, [dashboard, query, status]);
  const summary = dashboard?.summary;

  return <div className={styles.attendanceStack}>
    <div className={styles.attendanceMetrics}>
      <article><span className={styles.attendanceGreen}><CheckCircle2 /></span><div><p>Presentes</p><strong>{summary?.present ?? 0}</strong><small>de {summary?.total_employees ?? 0} colaboradores</small></div></article>
      <article><span className={styles.attendanceOrange}><ClockAlert /></span><div><p>Tardanzas</p><strong>{summary?.late ?? 0}</strong><small>{summary?.on_time ?? 0} ingresos puntuales</small></div></article>
      <article><span className={styles.attendanceGray}><UserX /></span><div><p>Sin registrar</p><strong>{summary?.without_record ?? 0}</strong><small>Sin marcación de entrada</small></div></article>
      <article><span className={styles.attendanceBlue}><TimerReset /></span><div><p>Horas extra</p><strong>{Math.floor((summary?.overtime_minutes ?? 0) / 60)} h {(summary?.overtime_minutes ?? 0) % 60} min</strong><small>{summary?.completed ?? 0} jornadas cerradas</small></div></article>
    </div>
    <article className={styles.card}>
      <header className={styles.toolbar}><div><h2>Asistencia diaria</h2><p>Marcaciones y cumplimiento de jornada del personal activo.</p></div><div className={styles.attendanceTools}>
        <label className={styles.dateControl}><CalendarDays size={15} /><input aria-label="Fecha de asistencia" type="date" max={businessToday()} value={date} onChange={event => setDate(event.target.value)} /></label>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>Actualizar</Button>
      </div></header>
      <div className={styles.attendanceFilters}><label className={styles.search}><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar colaborador..." /></label><select aria-label="Filtrar por estado" value={status} onChange={event => setStatus(event.target.value)}><option value="TODOS">Todos los estados</option><option value="PRESENTE">Presentes</option><option value="TARDANZA">Tardanzas</option><option value="SIN_REGISTRO">Sin registrar</option><option value="PERMISO">Permisos</option><option value="VACACIONES">Vacaciones</option></select><span>{employees.length} resultados</span></div>
      {loading && !dashboard ? <PageLoader compact label="Consultando asistencia" /> : error ? <div className={styles.tableError} role="alert"><p>{getApiErrorMessage(error, 'No se pudo consultar la asistencia.')}</p><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></div> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.attendanceTable}`}><thead><tr><th>Colaborador</th><th>Horario</th><th>Entrada</th><th>Salida almuerzo</th><th>Regreso</th><th>Salida final</th><th>Estado</th><th>Tardanza</th><th>Extra</th>{canManage && <th aria-label="Acciones" />}</tr></thead><tbody>
        {employees.map(employee => <tr key={employee.employee_id}><td><div className={styles.person}><span>{employee.names.charAt(0)}{employee.last_names.charAt(0)}</span><div><strong>{employee.names} {employee.last_names}</strong><small>{employee.job_role} · {employee.employee_code}</small></div></div></td><td>{employee.schedule ? <div className={styles.scheduleCell}><strong>{employee.schedule.name}</strong><small>{employee.schedule.start_time.slice(0, 5)}–{employee.schedule.end_time.slice(0, 5)}</small></div> : <span className={styles.muted}>Sin asignar</span>}</td><td className={styles.clockCell}>{clock(employee.marks.entry)}</td><td className={styles.clockCell}>{clock(employee.marks.lunch_out)}</td><td className={styles.clockCell}>{clock(employee.marks.lunch_return)}</td><td className={styles.clockCell}>{clock(employee.marks.exit)}</td><td><span className={`${styles.attendanceStatus} ${styles[`attendance${employee.status}`]}`}><i />{STATUS_LABELS[employee.status]}</span></td><td>{employee.delay_minutes ? `${employee.delay_minutes} min` : '—'}</td><td>{employee.overtime_minutes ? `${employee.overtime_minutes} min` : '—'}</td>{canManage && <td><div className={styles.actions}><button title="Corregir asistencia" aria-label={`Corregir asistencia de ${employee.names}`} onClick={() => setCorrecting(employee)}><PencilLine /></button></div></td>}</tr>)}
        {!employees.length && <tr><td colSpan={canManage ? 10 : 9}><div className={styles.empty}>No hay colaboradores que coincidan con los filtros seleccionados.</div></td></tr>}
      </tbody></table></div>}
    </article>
    <AttendanceCorrectionModal siteId={siteId} date={date} employee={correcting} onClose={() => setCorrecting(null)} onSaved={() => load()} />
  </div>;
}
