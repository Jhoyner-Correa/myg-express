import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  ClockAlert,
  Download,
  MapPin,
  RefreshCw,
  TimerReset,
  UserX,
  UsersRound,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { AbsenceWorkflows, AttendanceDashboard, AttendanceDashboardEmployee, Employee } from '../types';
import styles from '../Rrhh.module.css';
import { summarizeSitePerformance } from './overview-domain';

function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function businessDateLabel(date: string) {
  const value = new Date(`${date}T12:00:00-05:00`);
  const label = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(value);
  return label.charAt(0).toLocaleUpperCase('es') + label.slice(1);
}

function clock(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

const STATUS_LABELS: Record<AttendanceDashboardEmployee['status'], string> = {
  PRESENTE: 'Presente',
  TARDANZA: 'Tardanza',
  FALTA: 'Falta',
  PERMISO: 'Permiso',
  VACACIONES: 'Vacaciones',
  SIN_REGISTRO: 'Sin registrar',
  NO_LABORABLE: 'No laborable',
};

type ExecutiveAlert = { id: string; tone: 'critical' | 'warning' | 'info'; title: string; detail: string; target: string };
type Props = { siteId: number | null; employees: Employee[] };

export function RrhhOverview({ siteId, employees }: Props) {
  const navigate = useNavigate();
  const [attendance, setAttendance] = useState<AttendanceDashboard | null>(null);
  const [workflows, setWorkflows] = useState<AbsenceWorkflows | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const [attendanceData, workflowData] = await Promise.all([
        rrhhService.getAttendanceDashboard(siteId, businessToday(), signal),
        rrhhService.getAbsenceWorkflows(siteId, signal),
      ]);
      setAttendance(attendanceData);
      setWorkflows(workflowData);
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
  const sitePerformance = useMemo(() => summarizeSitePerformance(attendance?.employees ?? []), [attendance]);

  const alerts = useMemo<ExecutiveAlert[]>(() => {
    const attendanceAlerts = (attendance?.employees ?? [])
      .filter(item => item.status === 'SIN_REGISTRO' || item.status === 'FALTA' || item.status === 'TARDANZA')
      .map(item => ({
        id: `attendance-${item.employee_id}`,
        tone: item.status === 'TARDANZA' ? 'warning' as const : 'critical' as const,
        title: `${item.names} ${item.last_names}`,
        detail: item.status === 'TARDANZA' ? `${item.delay_minutes} min de tardanza · ${item.site_name}` : `${STATUS_LABELS[item.status]} · ${item.site_name}`,
        target: '/rrhh/asistencia',
      }));
    const permissionAlerts = pendingPermissions.map(item => ({ id: `permission-${item.id}`, tone: 'info' as const, title: `${item.nombres} ${item.apellidos}`, detail: `Permiso ${item.tipo_permiso.toLocaleLowerCase('es')} pendiente`, target: '/rrhh/solicitudes' }));
    const vacationAlerts = pendingVacations.map(item => ({ id: `vacation-${item.id}`, tone: 'info' as const, title: `${item.nombres} ${item.apellidos}`, detail: `${item.dias_tomados} días de vacaciones por revisar`, target: '/rrhh/solicitudes' }));
    return [...attendanceAlerts, ...permissionAlerts, ...vacationAlerts].slice(0, 5);
  }, [attendance, pendingPermissions, pendingVacations]);

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
        Entrada: clock(item.marks.entry),
        'Salida almuerzo': clock(item.marks.lunch_out),
        Regreso: clock(item.marks.lunch_return),
        'Salida final': clock(item.marks.exit),
        Estado: STATUS_LABELS[item.status],
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

  return <div className={styles.executiveDashboard}>
    <section className={styles.executiveKpis} aria-label="Indicadores principales">
      <article><div><span>Personal activo</span><strong>{activeEmployees}</strong><small>de {employees.length} registrados</small></div><i className={styles.kpiBlue}><UsersRound /></i></article>
      <article><div><span>Asistencia</span><strong>{attendanceRate}%</strong><small>{summary?.present ?? 0} presentes hoy</small></div><i className={styles.kpiGreen}><CalendarCheck2 /></i></article>
      <article><div><span>Tardanzas</span><strong>{summary?.late ?? 0}</strong><small>{summary?.on_time ?? 0} ingresos puntuales</small></div><i className={styles.kpiOrange}><ClockAlert /></i></article>
      <article><div><span>Horas extra</span><strong>{Math.floor((summary?.overtime_minutes ?? 0) / 60)} h {(summary?.overtime_minutes ?? 0) % 60} min</strong><small>{summary?.completed ?? 0} jornadas cerradas</small></div><i className={styles.kpiViolet}><TimerReset /></i></article>
      <article><div><span>Atención requerida</span><strong>{pendingRequests + (summary?.without_record ?? 0)}</strong><small>{pendingRequests} solicitudes pendientes</small></div><i className={styles.kpiRed}><BellRing /></i></article>
    </section>

    <article className={`${styles.card} ${styles.executiveAttendance}`}>
      <header className={styles.executiveCardHeader}><div className={styles.executiveTitle}><span><CalendarCheck2 /></span><div><h2>Asistencia de hoy</h2><p>{businessDateLabel(businessToday())}</p></div></div><div className={styles.executiveActions}><Button size="sm" variant="secondary" icon={<Download size={14} />} loading={exporting} onClick={() => void exportExcel()}>Exportar Excel</Button><Button size="sm" onClick={() => navigate('/rrhh/reportes')}>Ver reporte</Button></div></header>
      <div className={styles.tableWrap}><table className={`${styles.table} ${styles.executiveAttendanceTable}`}><thead><tr><th>Colaborador</th><th>Cargo</th><th>Entrada</th><th>Salida almuerzo</th><th>Regreso</th><th>Salida final</th><th>Estado</th><th>Tardanza</th><th>Horas extra</th></tr></thead><tbody>
        {(attendance?.employees ?? []).slice(0, 8).map(item => <tr key={item.employee_id}><td><div className={styles.person}><span>{item.names.charAt(0)}{item.last_names.charAt(0)}</span><div><strong>{item.names} {item.last_names}</strong><small>{item.site_name}</small></div></div></td><td>{item.job_role}</td><td className={styles.clockCell}>{clock(item.marks.entry)}</td><td className={styles.clockCell}>{clock(item.marks.lunch_out)}</td><td className={styles.clockCell}>{clock(item.marks.lunch_return)}</td><td className={styles.clockCell}>{clock(item.marks.exit)}</td><td><span className={`${styles.attendanceStatus} ${styles[`attendance${item.status}`]}`}><i />{STATUS_LABELS[item.status]}</span></td><td>{item.delay_minutes ? `${item.delay_minutes} min` : '—'}</td><td>{item.overtime_minutes ? `${item.overtime_minutes} min` : '—'}</td></tr>)}
        {!attendance?.employees.length && <tr><td colSpan={9}><div className={styles.empty}>No hay personal dentro del alcance seleccionado.</div></td></tr>}
      </tbody></table></div>
      {(attendance?.employees.length ?? 0) > 8 && <footer className={styles.executiveTableFooter}><span>Mostrando 8 de {attendance?.employees.length} colaboradores</span><button type="button" onClick={() => navigate('/rrhh/asistencia')}>Ver asistencia completa <ArrowRight /></button></footer>}
    </article>

    <section className={styles.executiveAnalysis}>
      <article className={`${styles.card} ${styles.executiveAlerts}`}>
        <header className={styles.executiveCardHeader}><div className={styles.executiveTitle}><span><BellRing /></span><div><h2>Atención requerida</h2><p>Eventos que necesitan seguimiento.</p></div></div></header>
        <div className={styles.executiveAlertList}>{alerts.map(alert => <button key={alert.id} type="button" onClick={() => navigate(alert.target)}><i className={styles[`alert${alert.tone}`]}>{alert.tone === 'critical' ? <UserX /> : alert.tone === 'warning' ? <AlertTriangle /> : <BellRing />}</i><span><strong>{alert.title}</strong><small>{alert.detail}</small></span><ArrowRight /></button>)}{!alerts.length && <div className={styles.executiveEmpty}><CheckCircle2 /><span>La operación no tiene alertas pendientes.</span></div>}</div>
      </article>

      <article className={`${styles.card} ${styles.executiveSites}`}>
        <header className={styles.executiveCardHeader}><div className={styles.executiveTitle}><span><MapPin /></span><div><h2>Rendimiento por sede</h2><p>Asistencia y puntualidad del día.</p></div></div></header>
        <div className={styles.tableWrap}><table className={styles.executiveSitesTable}><thead><tr><th>Sede</th><th>Personal</th><th>Asistencia</th><th>Tardanzas</th><th>Horas extra</th></tr></thead><tbody>{sitePerformance.map(site => <tr key={site.siteId}><td><i className={site.attendanceRate >= 90 ? styles.siteGood : site.attendanceRate >= 75 ? styles.siteWarning : styles.siteCritical} />{site.siteName}</td><td>{site.employees}</td><td><strong>{site.attendanceRate}%</strong></td><td>{site.late}</td><td>{Math.floor(site.overtimeMinutes / 60)} h {site.overtimeMinutes % 60} min</td></tr>)}{!sitePerformance.length && <tr><td colSpan={5}>Sin información por sede.</td></tr>}</tbody></table></div>
        <footer className={styles.executiveCardFooter}><button type="button" onClick={() => navigate('/rrhh/reportes')}>Ver reporte completo por sede <ArrowRight /></button></footer>
      </article>

      <article className={`${styles.card} ${styles.executiveSummary}`}>
        <header className={styles.executiveCardHeader}><div className={styles.executiveTitle}><span><UsersRound /></span><div><h2>Resumen del día</h2><p>Cobertura operativa actual.</p></div></div><Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} loading={loading} onClick={() => void load()}>Actualizar</Button></header>
        <div className={styles.executiveRingArea}><div className={styles.executiveRing} style={{ '--attendance-progress': `${attendanceRate}%` } as CSSProperties}><div><strong>{attendanceRate}%</strong><span>Asistencia</span></div></div><ul><li><i className={styles.legendGreen} /><span>Con asistencia</span><strong>{summary?.present ?? 0}</strong></li><li><i className={styles.legendOrange} /><span>Tardanzas incluidas</span><strong>{summary?.late ?? 0}</strong></li><li><i className={styles.legendGray} /><span>Sin registrar</span><strong>{summary?.without_record ?? 0}</strong></li><li><i className={styles.legendBlue} /><span>Con rastreo GPS</span><strong>{trackedEmployees}</strong></li></ul></div>
      </article>
    </section>
  </div>;
}
