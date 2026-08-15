import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  ClockAlert,
  Download,
  FileClock,
  MapPin,
  TimerReset,
  UserX,
  UsersRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { LiveLocationPanel } from '../../gps/LiveLocationPanel';
import { rrhhService } from '../rrhh.service';
import type { AbsenceWorkflows, AttendanceDashboard, AttendanceTrendPoint, Employee } from '../types';
import styles from '../Rrhh.module.css';
import { AgendaPanel } from './AgendaPanel';
import { ATTENDANCE_STATUS_LABELS, formatAttendanceClock } from './attendance-formatters';
import { DailySummaryCard } from './DailySummaryCard';
import { ExecutiveAttendanceTable } from './ExecutiveAttendanceTable';
import { ExecutiveKpiCard } from './ExecutiveKpiCard';
import { summarizeSitePerformance } from './overview-domain';
import { WorkforceAnalytics } from './WorkforceAnalytics';

function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function businessDateLabel(date: string) {
  const value = new Date(`${date}T12:00:00-05:00`);
  const label = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(value);
  return label.charAt(0).toLocaleUpperCase('es') + label.slice(1);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type ExecutiveAlert = {
  id: string;
  tone: 'critical' | 'warning' | 'info';
  kind: 'attendance' | 'request';
  title: string;
  site: string;
  time: string;
  target: string;
};
type Props = {
  siteId: number | null;
  employees: Employee[];
  query: string;
  agendaMonth: string;
  onAgendaMonthChange: (month: string) => void;
  onAlertCountChange: (count: number) => void;
};

export function RrhhOverview({ siteId, employees, query, agendaMonth, onAgendaMonthChange, onAlertCountChange }: Props) {
  const navigate = useNavigate();
  const [attendance, setAttendance] = useState<AttendanceDashboard | null>(null);
  const [trend, setTrend] = useState<AttendanceTrendPoint[]>([]);
  const [workflows, setWorkflows] = useState<AbsenceWorkflows | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const today = businessToday();
      const [attendanceData, workflowData, trendData] = await Promise.all([
        rrhhService.getAttendanceDashboard(siteId, today, signal),
        rrhhService.getAbsenceWorkflows(siteId, signal),
        rrhhService.getAttendanceTrend(siteId, shiftDate(today, -6), today, signal),
      ]);
      setAttendance(attendanceData);
      setWorkflows(workflowData);
      setTrend(trendData);
    } catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [siteId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const { pendingPermissions, pendingVacations } = useMemo(() => ({
    pendingPermissions: workflows?.permissions.filter(item => item.estado === 'PENDIENTE') ?? [],
    pendingVacations: workflows?.vacations.filter(item => item.estado === 'SOLICITADA') ?? [],
  }), [workflows]);
  const pendingRequests = pendingPermissions.length + pendingVacations.length;
  const activeEmployees = employees.filter(employee => employee.estado === 'ACTIVO').length;
  const trackedEmployees = employees.filter(employee => employee.estado === 'ACTIVO' && employee.tipoRastreo === 'CONTINUO').length;
  const summary = attendance?.summary;
  const attendanceRate = summary?.total_employees ? Math.round(summary.present / summary.total_employees * 100) : 0;
  const activeShare = employees.length ? Math.round(activeEmployees / employees.length * 100) : 0;

  const today = businessToday();
  const todayTrend = trend.find(point => point.date === today);
  const previousWorkingDay = [...trend].reverse().find(point => point.date < today && point.working_employees > 0);
  const attendanceComparison = todayTrend?.attendance_rate !== null && todayTrend?.attendance_rate !== undefined && previousWorkingDay?.attendance_rate !== null && previousWorkingDay?.attendance_rate !== undefined
    ? todayTrend.attendance_rate - previousWorkingDay.attendance_rate
    : null;
  const tardinessComparison = previousWorkingDay ? (summary?.late ?? 0) - previousWorkingDay.late : null;
  const sitePerformance = useMemo(() => summarizeSitePerformance(attendance?.employees ?? []), [attendance]);
  const gpsSites = useMemo(() => {
    const unique = new Map<number, { id: number; name: string }>();
    employees.forEach(employee => unique.set(employee.sedeId, { id: employee.sedeId, name: employee.sedeNombre ?? `Sede ${employee.sedeId}` }));
    return [...unique.values()];
  }, [employees]);

  const alerts = useMemo<ExecutiveAlert[]>(() => {
    const attendanceAlerts = (attendance?.employees ?? [])
      .filter(item => item.status === 'SIN_REGISTRO' || item.status === 'FALTA' || item.status === 'TARDANZA')
      .map(item => ({
        id: `attendance-${item.employee_id}`,
        tone: item.status === 'TARDANZA' ? 'warning' as const : 'critical' as const,
        kind: 'attendance' as const,
        title: item.status === 'TARDANZA' ? `${item.names} ${item.last_names} registró ${item.delay_minutes} min de tardanza` : item.status === 'FALTA' ? `${item.names} ${item.last_names} figura como falta` : `${item.names} ${item.last_names} no registró su entrada`,
        site: item.site_name,
        time: item.marks.entry === null ? 'Hoy' : formatAttendanceClock(item.marks.entry),
        target: '/rrhh/asistencia',
      }));
    const permissionAlerts = pendingPermissions.map(item => ({ id: `permission-${item.id}`, tone: 'info' as const, kind: 'request' as const, title: `Permiso ${item.tipo_permiso.toLocaleLowerCase('es')} de ${item.nombres} ${item.apellidos}`, site: item.sede_nombre, time: formatAttendanceClock(item.created_at), target: '/rrhh/solicitudes' }));
    const vacationAlerts = pendingVacations.map(item => ({ id: `vacation-${item.id}`, tone: 'info' as const, kind: 'request' as const, title: `Vacaciones de ${item.nombres} ${item.apellidos} por revisar`, site: item.sede_nombre, time: formatAttendanceClock(item.created_at), target: '/rrhh/solicitudes' }));
    return [...attendanceAlerts, ...permissionAlerts, ...vacationAlerts];
  }, [attendance, pendingPermissions, pendingVacations]);
  const displayedAlerts = showAllAlerts ? alerts : alerts.slice(0, 4);
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const visibleAttendance = useMemo(() => {
    if (!normalizedQuery) return attendance?.employees ?? [];
    return (attendance?.employees ?? []).filter(item => `${item.names} ${item.last_names} ${item.employee_code} ${item.site_name} ${item.job_role}`.toLocaleLowerCase('es').includes(normalizedQuery));
  }, [attendance, normalizedQuery]);

  useEffect(() => onAlertCountChange(alerts.length), [alerts.length, onAlertCountChange]);

  const exportExcel = async () => {
    if (!attendance?.employees.length) { showToast('No hay información de asistencia para exportar.', 'warning'); return; }
    setExporting(true);
    try {
      const XLSX = await import('xlsx');
      const rows = attendance.employees.map(item => ({
        Código: item.employee_code,
        Colaborador: `${item.names} ${item.last_names}`,
        Sede: item.site_name,
        Cargo: item.job_role,
        Entrada: formatAttendanceClock(item.marks.entry),
        'Salida almuerzo': formatAttendanceClock(item.marks.lunch_out),
        Regreso: formatAttendanceClock(item.marks.lunch_return),
        'Salida final': formatAttendanceClock(item.marks.exit),
        Estado: ATTENDANCE_STATUS_LABELS[item.status],
        'Tardanza (min)': item.delay_minutes,
        'Horas extra (min)': item.overtime_minutes,
      }));
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, ...Array.from({ length: 7 }, () => ({ wch: 17 }))];
      XLSX.utils.book_append_sheet(workbook, sheet, 'Asistencia');
      XLSX.writeFile(workbook, `asistencia-${businessToday()}.xlsx`);
      showToast('Reporte de asistencia exportado.', 'success');
    } catch (exportError) { showToast(getApiErrorMessage(exportError, 'No se pudo exportar el reporte.'), 'error'); }
    finally { setExporting(false); }
  };

  if (loading && !attendance) return <PageLoader label="Preparando resumen ejecutivo" />;
  if (error && !attendance) return <div className={styles.errorState} role="alert"><p>{getApiErrorMessage(error, 'No se pudo preparar el resumen ejecutivo.')}</p><Button variant="secondary" onClick={() => void load()}>Reintentar</Button></div>;

  const attentionPanel = <article id="rrhh-attention-required" className={`${styles.card} ${styles.executiveAlerts}`}>
    <header className={styles.executiveCardHeader}><div className={styles.executiveTitle}><span><BellRing /></span><div><h2>Atención requerida</h2><p>Eventos que necesitan seguimiento.</p></div></div></header>
    <div className={styles.executiveAlertList}>{displayedAlerts.map(alert => <div className={styles.executiveAlertRow} key={alert.id}><i className={`${styles.alertPriority} ${styles[`priority${alert.tone}`]}`} /><span className={`${styles.alertIcon} ${styles[`alert${alert.tone}`]}`}>{alert.kind === 'request' ? <FileClock /> : alert.tone === 'critical' ? <UserX /> : <AlertTriangle />}</span><div className={styles.alertCopy}><strong>{alert.title}</strong></div><span className={styles.alertMeta}>{alert.site} · {alert.time}</span><button type="button" onClick={() => navigate(alert.target)}>Revisar</button></div>)}{!alerts.length && <div className={styles.executiveEmpty}><CheckCircle2 /><span>La operación no tiene alertas pendientes.</span></div>}</div>
    {alerts.length > 4 && <footer className={styles.executiveAlertFooter}><button type="button" onClick={() => setShowAllAlerts(current => !current)}>{showAllAlerts ? 'Mostrar resumen' : `Ver todas las alertas (${alerts.length})`} <ArrowRight /></button></footer>}
  </article>;

  const performancePanel = <article className={`${styles.card} ${styles.executiveSites} ${styles.executiveSitesCompact}`}>
    <header className={styles.executiveCardHeader}><div className={styles.executiveTitle}><span><MapPin /></span><div><h2>Rendimiento por sede</h2><p>Asistencia y puntualidad del día.</p></div></div></header>
    <div className={styles.tableWrap}><table className={styles.executiveSitesTable}><thead><tr><th>Sede</th><th>Personal</th><th>Asistencia</th><th>Tardanzas</th><th>Horas extra</th></tr></thead><tbody>{sitePerformance.map(site => <tr key={site.siteId}><td><i className={site.attendanceRate >= 90 ? styles.siteGood : site.attendanceRate >= 75 ? styles.siteWarning : styles.siteCritical} />{site.siteName}</td><td>{site.employees}</td><td><strong>{site.attendanceRate}%</strong></td><td>{site.late}</td><td>{Math.floor(site.overtimeMinutes / 60)} h {site.overtimeMinutes % 60} min</td></tr>)}{!sitePerformance.length && <tr><td colSpan={5}>Sin información por sede.</td></tr>}</tbody></table></div>
    <footer className={styles.executiveCardFooter}><button type="button" onClick={() => navigate('/rrhh/reportes')}>Ver reporte completo por sede <ArrowRight /></button></footer>
  </article>;

  return <div className={styles.executiveDashboard}>
    <section className={styles.executiveTopGrid} aria-label="Resumen operativo y agenda">
      <div className={styles.executiveTopMain}>
        <section className={styles.executiveKpis} aria-label="Indicadores principales">
          <ExecutiveKpiCard label="Personal activo" value={activeEmployees} insight={`${activeShare}% del personal registrado`} context={`${employees.length} colaboradores en el alcance`} icon={<UsersRound />} tone="blue" />
          <ExecutiveKpiCard label="Asistencia" value={`${attendanceRate}%`} insight="Sin período comparable" context={`${summary?.present ?? 0} presentes hoy`} icon={<CalendarCheck2 />} tone="green" comparison={attendanceComparison === null ? undefined : { delta: attendanceComparison, suffix: ' p.p.' }} />
          <ExecutiveKpiCard label="Horas extra" value={`${Math.floor((summary?.overtime_minutes ?? 0) / 60)} h ${(summary?.overtime_minutes ?? 0) % 60} min`} insight={`${summary?.completed ?? 0} jornadas cerradas`} context="Tiempo adicional registrado hoy" icon={<TimerReset />} tone="violet" />
          <ExecutiveKpiCard label="Tardanzas" value={summary?.late ?? 0} insight="Sin período comparable" context={`${summary?.on_time ?? 0} ingresos puntuales`} icon={<ClockAlert />} tone="orange" comparison={tardinessComparison === null ? undefined : { delta: tardinessComparison, lowerIsBetter: true }} />
          <ExecutiveKpiCard label="Atención requerida" value={pendingRequests + (summary?.without_record ?? 0)} insight={`${pendingRequests} solicitudes pendientes`} context="Incidencias que requieren revisión" icon={<BellRing />} tone="red" />
        </section>

        <article className={`${styles.card} ${styles.executiveAttendance}`}>
          <header className={styles.executiveCardHeader}><div className={styles.executiveTitle}><span><CalendarCheck2 /></span><div><h2>Asistencia de hoy</h2><p>{businessDateLabel(businessToday())}</p></div></div><div className={styles.executiveActions}><Button size="sm" variant="secondary" icon={<Download size={14} />} loading={exporting} onClick={() => void exportExcel()}>Exportar Excel</Button><Button size="sm" variant="corporate" onClick={() => navigate('/rrhh/reportes')}>Ver reporte</Button></div></header>
          <ExecutiveAttendanceTable
            employees={visibleAttendance}
            emptyMessage={normalizedQuery ? 'No encontramos colaboradores con esa búsqueda.' : 'No hay personal dentro del alcance seleccionado.'}
          />
          {(attendance?.employees.length ?? 0) > 8 && <footer className={styles.executiveTableFooter}><span>{attendance?.employees.length} colaboradores en la vista</span><button type="button" onClick={() => navigate('/rrhh/asistencia')}>Ver asistencia completa <ArrowRight /></button></footer>}
        </article>
      </div>

      <aside className={styles.executiveTopAside} aria-label="Resumen diario y agenda">
        <DailySummaryCard attendance={attendance} trackedEmployees={trackedEmployees} refreshing={loading} onRefresh={() => void load()} />
        <AgendaPanel siteId={siteId} workflows={workflows} month={agendaMonth} onMonthChange={onAgendaMonthChange} onOpenCalendar={() => navigate('/rrhh/horarios')} />
      </aside>
    </section>

    <WorkforceAnalytics
      trend={trend}
      onOpenReport={() => navigate('/rrhh/reportes')}
      attentionPanel={attentionPanel}
      performancePanel={performancePanel}
      locationPanel={<LiveLocationPanel sites={gpsSites} onOpenFullMap={() => navigate('/rrhh/gps')} />}
    />
  </div>;
}
