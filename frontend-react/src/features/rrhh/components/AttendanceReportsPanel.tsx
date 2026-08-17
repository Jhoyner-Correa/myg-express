import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CalendarDays, CheckCircle2, ClockAlert, Download, RefreshCw, Search, TimerReset, UserX } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { exportAttendanceWorkbook } from '../reports/attendance-excel-report';
import { rrhhService } from '../rrhh.service';
import type {
  AbsenceWorkflows,
  AttendanceDashboard,
  AttendanceDashboardEmployee,
  AttendanceTrendPoint,
  Employee,
} from '../types';
import styles from '../Rrhh.module.css';

type StatusFilter = 'TODOS' | AttendanceDashboardEmployee['status'];

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'TODOS', label: 'Todos los estados' },
  { value: 'PRESENTE', label: 'Presente' },
  { value: 'TARDANZA', label: 'Tardanza' },
  { value: 'SIN_REGISTRO', label: 'Sin registrar' },
  { value: 'FALTA', label: 'Falta' },
  { value: 'PERMISO', label: 'Permiso' },
  { value: 'VACACIONES', label: 'Vacaciones' },
  { value: 'NO_LABORABLE', label: 'No laborable' },
];

function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function clock(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function normalizedStatus(status: AttendanceDashboardEmployee['status']) {
  return STATUS_OPTIONS.find(option => option.value === status)?.label ?? status;
}

type Props = {
  siteId: number | null;
  employees: Employee[];
};

export function AttendanceReportsPanel({ siteId, employees }: Props) {
  const [date, setDate] = useState(businessToday);
  const [dashboard, setDashboard] = useState<AttendanceDashboard | null>(null);
  const [trend, setTrend] = useState<AttendanceTrendPoint[]>([]);
  const [workflows, setWorkflows] = useState<AbsenceWorkflows | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('TODOS');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [attendanceData, trendData, workflowData] = await Promise.all([
        rrhhService.getAttendanceDashboard(siteId, date, signal),
        rrhhService.getAttendanceTrend(siteId, shiftDate(date, -6), date, signal),
        rrhhService.getAbsenceWorkflows(siteId, signal),
      ]);
      setDashboard(attendanceData);
      setTrend(trendData);
      setWorkflows(workflowData);
    } catch (loadError) {
      if (!axios.isCancel(loadError)) setError(loadError);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [date, siteId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const visibleEmployees = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    return (dashboard?.employees ?? []).filter(item => {
      const matchesStatus = status === 'TODOS' || item.status === status;
      const searchable = `${item.names} ${item.last_names} ${item.employee_code} ${item.site_name} ${item.job_role}`.toLocaleLowerCase('es');
      return matchesStatus && (!term || searchable.includes(term));
    });
  }, [dashboard, query, status]);

  const exportExcel = async () => {
    if (!dashboard || visibleEmployees.length === 0) {
      showToast('No hay registros para exportar con los filtros seleccionados.', 'warning');
      return;
    }
    setExporting(true);
    try {
      const selectedSite = employees.find(employee => employee.sedeId === siteId)?.sedeNombre;
      const scopeLabel = siteId === null ? 'Todas las sedes' : selectedSite ?? visibleEmployees[0]?.site_name ?? 'Sede seleccionada';
      await exportAttendanceWorkbook({
        attendance: { ...dashboard, employees: visibleEmployees },
        trend,
        workflows,
        employees,
        scopeLabel,
      });
      showToast('Reporte Excel empresarial generado correctamente.', 'success');
    } catch (exportError) {
      showToast(getApiErrorMessage(exportError, 'No se pudo generar el reporte Excel.'), 'error');
    } finally {
      setExporting(false);
    }
  };

  const summary = dashboard?.summary;
  return <div className={styles.attendanceStack}>
    <div className={styles.attendanceMetrics}>
      <article><span className={styles.attendanceGreen}><CheckCircle2 /></span><div><p>Presentes</p><strong>{summary?.present ?? 0}</strong><small>de {summary?.total_employees ?? 0} colaboradores</small></div></article>
      <article><span className={styles.attendanceOrange}><ClockAlert /></span><div><p>Tardanzas</p><strong>{summary?.late ?? 0}</strong><small>{summary?.on_time ?? 0} ingresos puntuales</small></div></article>
      <article><span className={styles.attendanceGray}><UserX /></span><div><p>Sin registrar</p><strong>{summary?.without_record ?? 0}</strong><small>Requieren revisión</small></div></article>
      <article><span className={styles.attendanceBlue}><TimerReset /></span><div><p>Horas extra</p><strong>{Math.floor((summary?.overtime_minutes ?? 0) / 60)} h {(summary?.overtime_minutes ?? 0) % 60} min</strong><small>{summary?.completed ?? 0} jornadas cerradas</small></div></article>
    </div>

    <article className={styles.card}>
      <header className={styles.toolbar}>
        <div><h2>Reporte diario de asistencia</h2><p>Consulta, filtra y genera un libro Excel analítico con información operativa real.</p></div>
        <div className={styles.attendanceTools}>
          <label className={styles.dateControl}><CalendarDays size={15} /><input aria-label="Fecha del reporte" type="date" max={businessToday()} value={date} onChange={event => setDate(event.target.value)} /></label>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>Actualizar</Button>
          <Button size="sm" icon={<Download size={14} />} loading={exporting} onClick={() => void exportExcel()}>Exportar Excel</Button>
        </div>
      </header>

      <div className={styles.reportFilters} aria-label="Filtros del reporte">
        <label className={styles.search}><Search size={15} /><input aria-label="Buscar colaborador en el reporte" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar colaborador, sede o cargo..." /></label>
        <label className={styles.reportStatusFilter}>
          <span>Estado</span>
          <select aria-label="Filtrar reporte por estado" value={status} onChange={event => setStatus(event.target.value as StatusFilter)}>
            {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <span className={styles.reportResultCount}>{visibleEmployees.length} {visibleEmployees.length === 1 ? 'resultado' : 'resultados'}</span>
      </div>

      {Boolean(error && dashboard) && <div className={styles.staleDataWarning} role="status">No se pudo actualizar la información. Se muestran los últimos datos disponibles.</div>}
      {loading && !dashboard
        ? <PageLoader compact label="Generando reporte" />
        : error && !dashboard
          ? <div className={styles.tableError} role="alert"><p>{getApiErrorMessage(error, 'No se pudo generar el reporte.')}</p><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></div>
          : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.reportTable}`}><thead><tr><th>Colaborador</th><th>Sede</th><th>Cargo</th><th>Estado</th><th>Entrada</th><th>Salida final</th><th>Tardanza</th><th>Extra</th></tr></thead><tbody>{visibleEmployees.map(item => <tr key={item.employee_id}><td><div className={styles.person}><span>{item.names.charAt(0)}{item.last_names.charAt(0)}</span><div><strong>{item.names} {item.last_names}</strong><small>{item.employee_code}</small></div></div></td><td>{item.site_name}</td><td>{item.job_role}</td><td><span className={`${styles.attendanceStatus} ${styles[`attendance${item.status}`]}`}><i />{normalizedStatus(item.status)}</span></td><td>{clock(item.marks.entry) || '—'}</td><td>{clock(item.marks.exit) || '—'}</td><td>{item.delay_minutes ? `${item.delay_minutes} min` : '—'}</td><td>{item.overtime_minutes ? `${item.overtime_minutes} min` : '—'}</td></tr>)}{visibleEmployees.length === 0 && <tr><td colSpan={8}><div className={styles.empty}>No hay información que coincida con los filtros seleccionados.</div></td></tr>}</tbody></table></div>}
    </article>
  </div>;
}
