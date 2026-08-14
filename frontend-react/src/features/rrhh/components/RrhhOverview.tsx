import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, CalendarCheck2, ClockAlert, ClipboardList, RefreshCw, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { rrhhService } from '../rrhh.service';
import type { AbsenceWorkflows, AttendanceDashboard, Employee } from '../types';
import styles from '../Rrhh.module.css';

function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

type Props = { siteId: number | null; employees: Employee[] };

export function RrhhOverview({ siteId, employees }: Props) {
  const navigate = useNavigate();
  const [attendance, setAttendance] = useState<AttendanceDashboard | null>(null);
  const [workflows, setWorkflows] = useState<AbsenceWorkflows | null>(null);
  const [loading, setLoading] = useState(true);
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

  const pendingRequests = useMemo(() => {
    const permissions = workflows?.permissions.filter(item => item.estado === 'PENDIENTE').length ?? 0;
    const vacations = workflows?.vacations.filter(item => item.estado === 'SOLICITADA').length ?? 0;
    return permissions + vacations;
  }, [workflows]);
  const incidents = attendance?.employees.filter(item => item.status === 'TARDANZA' || item.status === 'SIN_REGISTRO').slice(0, 6) ?? [];
  const activeEmployees = employees.filter(employee => employee.estado === 'ACTIVO').length;

  if (loading && !attendance) return <PageLoader label="Preparando resumen ejecutivo" />;
  if (error && !attendance) return <div className={styles.errorState} role="alert"><p>{getApiErrorMessage(error, 'No se pudo preparar el resumen ejecutivo.')}</p><Button variant="secondary" onClick={() => void load()}>Reintentar</Button></div>;

  return <div className={styles.overviewStack}>
    <div className={styles.attendanceMetrics}>
      <article><span className={styles.attendanceBlue}><UsersRound /></span><div><p>Personal activo</p><strong>{activeEmployees}</strong><small>{employees.length} colaboradores registrados</small></div></article>
      <article><span className={styles.attendanceGreen}><CalendarCheck2 /></span><div><p>Presentes hoy</p><strong>{attendance?.summary.present ?? 0}</strong><small>de {attendance?.summary.total_employees ?? 0} esperados</small></div></article>
      <article><span className={styles.attendanceOrange}><ClockAlert /></span><div><p>Tardanzas</p><strong>{attendance?.summary.late ?? 0}</strong><small>{attendance?.summary.on_time ?? 0} ingresos puntuales</small></div></article>
      <article><span className={styles.attendanceGray}><ClipboardList /></span><div><p>Solicitudes pendientes</p><strong>{pendingRequests}</strong><small>Requieren revisión administrativa</small></div></article>
    </div>

    <div className={styles.overviewGrid}>
      <article className={styles.card}>
        <header className={styles.toolbar}><div><h2>Atención operativa</h2><p>Incidencias de asistencia que requieren seguimiento.</p></div><Button size="sm" variant="secondary" onClick={() => navigate('/rrhh/asistencia')}>Ver asistencia</Button></header>
        <div className={styles.overviewList}>
          {incidents.map(item => <div key={item.employee_id}><span className={styles.overviewAlertIcon}><AlertTriangle /></span><div><strong>{item.names} {item.last_names}</strong><small>{item.site_name} · {item.status === 'TARDANZA' ? `${item.delay_minutes} min de tardanza` : 'Sin marcación de entrada'}</small></div><b>{item.status === 'TARDANZA' ? 'Tardanza' : 'Sin registrar'}</b></div>)}
          {!incidents.length && <div className={styles.overviewEmpty}>No hay incidencias operativas para hoy.</div>}
        </div>
      </article>
      <article className={styles.card}>
        <header className={styles.toolbar}><div><h2>Control administrativo</h2><p>Estado general del flujo de Recursos Humanos.</p></div><Button size="sm" variant="secondary" onClick={() => navigate('/rrhh/solicitudes')}>Ver solicitudes</Button></header>
        <div className={styles.overviewFacts}>
          <div><span>Permisos pendientes</span><strong>{workflows?.permissions.filter(item => item.estado === 'PENDIENTE').length ?? 0}</strong></div>
          <div><span>Vacaciones solicitadas</span><strong>{workflows?.vacations.filter(item => item.estado === 'SOLICITADA').length ?? 0}</strong></div>
          <div><span>Sin marcación</span><strong>{attendance?.summary.without_record ?? 0}</strong></div>
          <div><span>Horas extra acumuladas</span><strong>{Math.floor((attendance?.summary.overtime_minutes ?? 0) / 60)} h {(attendance?.summary.overtime_minutes ?? 0) % 60} min</strong></div>
        </div>
      </article>
    </div>
    <div className={styles.overviewRefresh}><span>Información operativa del {businessToday()}.</span><Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>Actualizar resumen</Button></div>
  </div>;
}
