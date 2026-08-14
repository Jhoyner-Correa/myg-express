import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarDays, CheckCircle2, ClockAlert, Download, RefreshCw, TimerReset, UserX } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { AttendanceDashboard } from '../types';
import styles from '../Rrhh.module.css';

function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function csvCell(value: string | number) { return `"${String(value).replaceAll('"', '""')}"`; }
function clock(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function AttendanceReportsPanel({ siteId }: { siteId: number | null }) {
  const [date, setDate] = useState(businessToday);
  const [dashboard, setDashboard] = useState<AttendanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

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

  const exportCsv = () => {
    if (!dashboard?.employees.length) { showToast('No hay registros para exportar en la fecha seleccionada.', 'warning'); return; }
    const headers = ['Código', 'Colaborador', 'Sede', 'Cargo', 'Estado', 'Entrada', 'Salida almuerzo', 'Regreso', 'Salida final', 'Tardanza (min)', 'Horas extra (min)'];
    const rows = dashboard.employees.map(item => [item.employee_code, `${item.names} ${item.last_names}`, item.site_name, item.job_role, item.status, clock(item.marks.entry), clock(item.marks.lunch_out), clock(item.marks.lunch_return), clock(item.marks.exit), item.delay_minutes, item.overtime_minutes]);
    const csv = `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `asistencia-${date}.csv`; anchor.click();
    URL.revokeObjectURL(url);
    showToast('Reporte exportado correctamente.', 'success');
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
      <header className={styles.toolbar}><div><h2>Reporte diario de asistencia</h2><p>Consulta, revisa y exporta el consolidado operativo por fecha.</p></div><div className={styles.attendanceTools}><label className={styles.dateControl}><CalendarDays size={15} /><input aria-label="Fecha del reporte" type="date" max={businessToday()} value={date} onChange={event => setDate(event.target.value)} /></label><Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>Actualizar</Button><Button size="sm" icon={<Download size={14} />} onClick={exportCsv}>Exportar CSV</Button></div></header>
      {loading && !dashboard ? <PageLoader compact label="Generando reporte" /> : error ? <div className={styles.tableError} role="alert"><p>{getApiErrorMessage(error, 'No se pudo generar el reporte.')}</p><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></div> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.reportTable}`}><thead><tr><th>Colaborador</th><th>Sede</th><th>Cargo</th><th>Estado</th><th>Entrada</th><th>Salida final</th><th>Tardanza</th><th>Extra</th></tr></thead><tbody>{(dashboard?.employees ?? []).map(item => <tr key={item.employee_id}><td><div className={styles.person}><span>{item.names.charAt(0)}{item.last_names.charAt(0)}</span><div><strong>{item.names} {item.last_names}</strong><small>{item.employee_code}</small></div></div></td><td>{item.site_name}</td><td>{item.job_role}</td><td><span className={`${styles.attendanceStatus} ${styles[`attendance${item.status}`]}`}><i />{item.status.replace('_', ' ').toLocaleLowerCase('es')}</span></td><td>{clock(item.marks.entry) || '—'}</td><td>{clock(item.marks.exit) || '—'}</td><td>{item.delay_minutes ? `${item.delay_minutes} min` : '—'}</td><td>{item.overtime_minutes ? `${item.overtime_minutes} min` : '—'}</td></tr>)}{!dashboard?.employees.length && <tr><td colSpan={8}><div className={styles.empty}>No hay información de asistencia para esta fecha.</div></td></tr>}</tbody></table></div>}
    </article>
  </div>;
}
