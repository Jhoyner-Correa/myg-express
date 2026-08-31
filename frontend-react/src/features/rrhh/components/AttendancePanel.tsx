import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import axios from 'axios';
import {
  Activity, AlertTriangle, Building2, CalendarCheck2, CalendarDays, CalendarOff, CheckCircle2,
  CalendarRange, ChevronDown, ChevronUp, Clock3, ClockAlert, Coffee, Download, Eye, LogOut, MapPin, PencilLine,
  RefreshCw, Search, ShieldCheck, UserX,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { exportAttendanceWorkbook } from '../reports/attendance-excel-report';
import { rrhhService } from '../rrhh.service';
import type { AttendanceDashboard, AttendanceDashboardEmployee, Employee, Site } from '../types';
import styles from './AttendancePanel.module.css';
import { AttendanceCorrectionModal } from './AttendanceCorrectionModal';
import { AttendanceDetailModal } from './AttendanceDetailModal';
import { EmployeeAttendanceReportModal } from './EmployeeAttendanceReportModal';
import { formatDurationMinutes, formatScheduleRange } from './attendance-formatters';
import { BiometricReviewPanel } from './BiometricReviewPanel';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';

type AttendanceSortKey = 'employee' | 'site' | 'schedule' | 'entry' | 'status' | 'delay' | 'overtime';
type AttendanceSort = { key: AttendanceSortKey; direction: 'asc' | 'desc' };
type StatusMeta = { label: string; detail: string; icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }> };

function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function clock(value: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function longDate(value: string) {
  const formatted = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
  return formatted.charAt(0).toLocaleUpperCase('es') + formatted.slice(1);
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const STATUS_META: Record<AttendanceDashboardEmployee['operational_status'], StatusMeta> = {
  PROGRAMADO: { label: 'Programado', detail: 'Jornada futura', icon: CalendarDays },
  PENDIENTE_ENTRADA: { label: 'Pendiente de entrada', detail: 'Dentro del horario', icon: Clock3 },
  ENTRADA_RETRASADA: { label: 'Entrada retrasada', detail: 'Requiere seguimiento', icon: ClockAlert },
  EN_JORNADA: { label: 'En jornada', detail: 'Operación activa', icon: Activity },
  EN_ALMUERZO: { label: 'En almuerzo', detail: 'Regreso pendiente', icon: Coffee },
  REGRESO_RETRASADO: { label: 'Regreso retrasado', detail: 'Requiere seguimiento', icon: ClockAlert },
  SALIDA_PENDIENTE: { label: 'Salida pendiente', detail: 'Cierre requerido', icon: LogOut },
  JORNADA_COMPLETADA: { label: 'Jornada completa', detail: 'Marcaciones cerradas', icon: CheckCircle2 },
  JORNADA_INCOMPLETA: { label: 'Jornada incompleta', detail: 'Revisión requerida', icon: AlertTriangle },
  FALTA: { label: 'Falta', detail: 'Ausencia registrada', icon: UserX },
  PERMISO: { label: 'Permiso', detail: 'Ausencia autorizada', icon: ShieldCheck },
  VACACIONES: { label: 'Vacaciones', detail: 'Ausencia autorizada', icon: CalendarDays },
  NO_LABORABLE: { label: 'No laborable', detail: 'Sin jornada programada', icon: CalendarOff },
};

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function sortValue(employee: AttendanceDashboardEmployee, key: AttendanceSortKey): string | number {
  if (key === 'employee') return `${employee.last_names} ${employee.names}`;
  if (key === 'site') return employee.site_name;
  if (key === 'schedule') return employee.schedule?.name ?? '';
  if (key === 'entry') return employee.marks.entry ?? '';
  if (key === 'status') return STATUS_META[employee.operational_status].label;
  if (key === 'delay') return employee.delay_minutes;
  return employee.overtime_minutes;
}

function compareEmployees(first: AttendanceDashboardEmployee, second: AttendanceDashboardEmployee, sort: AttendanceSort) {
  const firstValue = sortValue(first, sort.key);
  const secondValue = sortValue(second, sort.key);
  const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
    ? firstValue - secondValue
    : collator.compare(String(firstValue), String(secondValue));
  return sort.direction === 'asc' ? comparison : -comparison;
}

function Status({ employee }: { employee: AttendanceDashboardEmployee }) {
  const meta = STATUS_META[employee.operational_status];
  const Icon = meta.icon;
  const operationalDetail = employee.status === 'TARDANZA'
    && ['EN_JORNADA', 'JORNADA_COMPLETADA'].includes(employee.operational_status)
    ? 'Ingreso con tardanza'
    : employee.return_delay_minutes > 0
      ? `Regreso: ${formatDurationMinutes(employee.return_delay_minutes)}`
      : meta.detail;
  const justificationDetail = employee.justification?.status === 'APROBADA'
    ? 'Justificación aprobada'
    : employee.justification?.status === 'PENDIENTE'
      ? 'Justificación por revisar'
      : employee.justification?.status === 'RECHAZADA'
        ? 'Justificación no aprobada'
        : null;
  return <span className={`${styles.status} ${styles[`status${employee.operational_status}`]}`}>
    <Icon size={14} aria-hidden />
    <span><strong>{meta.label}</strong><small className={justificationDetail ? styles[`justification${employee.justification?.status}`] : undefined}>{justificationDetail ?? operationalDetail}</small></span>
  </span>;
}

export function AttendancePanel({ siteId, sites = [], canViewAllSites = false, canManage, employees: employeeDirectory = [], date = businessToday(), onSiteChange, onDateChange }: {
  siteId: number | null;
  sites?: Site[];
  canViewAllSites?: boolean;
  canManage: boolean;
  employees?: Employee[];
  date?: string;
  onSiteChange?: (siteId: number | null) => void;
  onDateChange?: (date: string) => void;
}) {
  const [dashboard, setDashboard] = useState<AttendanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('TODOS');
  const [sort, setSort] = useState<AttendanceSort>({ key: 'employee', direction: 'asc' });
  const [correcting, setCorrecting] = useState<AttendanceDashboardEmployee | null>(null);
  const [viewing, setViewing] = useState<AttendanceDashboardEmployee | null>(null);
  const [reportEmployeeId, setReportEmployeeId] = useState<number | null | undefined>(undefined);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try { setDashboard(await rrhhService.getAttendanceDashboard(siteId, date, signal)); }
    catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [date, siteId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const employeeById = useMemo(() => new Map(employeeDirectory.map(employee => [employee.id, employee])), [employeeDirectory]);
  const visibleEmployees = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    return (dashboard?.employees ?? [])
      .filter(employee => {
        const searchable = `${employee.names} ${employee.last_names} ${employee.employee_code} ${employee.job_role} ${employee.site_name}`.toLocaleLowerCase('es');
        return (!term || searchable.includes(term))
          && (status === 'TODOS'
            || (status === 'JUSTIFICACION_PENDIENTE' && employee.justification?.status === 'PENDIENTE')
            || (status === 'JUSTIFICACION_APROBADA' && employee.justification?.status === 'APROBADA')
            || (status === 'JUSTIFICACION_RECHAZADA' && employee.justification?.status === 'RECHAZADA')
            || employee.operational_status === status
            || (status === 'REQUIERE_ATENCION' && employee.requires_attention));
      })
      .sort((first, second) => compareEmployees(first, second, sort));
  }, [dashboard, query, sort, status]);

  const workDay = dashboard?.work_day ?? null;
  const scopeLabel = siteId === null
    ? 'Todas las sedes'
    : dashboard?.employees[0]?.site_name ?? employeeDirectory[0]?.sedeNombre ?? 'Sede seleccionada';
  const selectedSiteLabel = siteId === null
    ? 'Todas las sedes'
    : sites.find(site => site.id === siteId)?.name ?? 'Sede seleccionada';

  const changeSort = (key: AttendanceSortKey) => {
    setSort(current => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  };

  const sortableHeader = (key: AttendanceSortKey, label: string) => {
    const active = sort.key === key ? sort.direction : null;
    return <th aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}>
      <button type="button" className={styles.sortButton} onClick={() => changeSort(key)} aria-label={`Ordenar por ${label}`}>
        {label}<span className={styles.sortIndicator} aria-hidden><ChevronUp className={active === 'asc' ? styles.sortActive : ''} /><ChevronDown className={active === 'desc' ? styles.sortActive : ''} /></span>
      </button>
    </th>;
  };

  const exportExcel = async () => {
    if (!dashboard?.employees.length) {
      showToast('No hay información de asistencia para exportar.', 'warning');
      return;
    }
    setExporting(true);
    try {
      const [trend, workflows] = await Promise.all([
        rrhhService.getAttendanceTrend(siteId, shiftDate(date, -6), date),
        rrhhService.getAbsenceWorkflows(siteId),
      ]);
      await exportAttendanceWorkbook({ attendance: dashboard, trend, workflows, employees: employeeDirectory, scopeLabel });
      showToast('Reporte corporativo de asistencia generado correctamente.', 'success');
    } catch (exportError) {
      showToast(getApiErrorMessage(exportError, 'No se pudo generar el reporte de asistencia.'), 'error');
    } finally { setExporting(false); }
  };

  return <div className={styles.stack}>
    {workDay !== null && workDay.reason !== 'REGULAR' && <div className={`${styles.workDayNotice} ${workDay.working ? styles.workDaySpecial : styles.workDayOff}`}>
      <CalendarOff aria-hidden /><div><strong>{workDay.name ?? 'Día no laborable'}</strong><span>{workDay.working ? 'La jornada especial reemplaza el horario semanal de esta fecha.' : 'No se esperan marcaciones ni se contabilizan ausencias.'}</span></div><small>{workDay.scope === 'SEDE' ? 'Regla de sede' : 'Regla corporativa'}</small>
    </div>}

    <article className={styles.dailyCard}>
      <header className={styles.cardHeader}>
        <div className={styles.cardTitle}><span><CalendarCheck2 /></span><div><h2>Control diario de asistencia</h2><p>{longDate(date)} · {scopeLabel}</p></div></div>
        <div className={styles.headerActions}>
          <BiometricReviewPanel siteId={siteId} canManage={canManage} onResolved={() => load()} />
          <Button className={styles.reportButton} size="sm" variant="secondary" icon={<CalendarRange size={14} />} disabled={!employeeDirectory.length} onClick={() => setReportEmployeeId(null)}>Historial por colaborador</Button>
          <label className={styles.scopeControl} title="Filtrar asistencia por sede">
            <Building2 aria-hidden="true" />
            <span>{selectedSiteLabel}</span>
            <select aria-label="Sede de asistencia" value={siteId ?? 'all'} onChange={event => onSiteChange?.(event.target.value === 'all' ? null : Number(event.target.value))}>
              {(canViewAllSites || siteId === null) && <option value="all">Todas las sedes</option>}
              {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <Button className={styles.exportButton} size="sm" variant="secondary" icon={<Download size={14} />} loading={exporting} onClick={() => void exportExcel()}>Exportar Excel</Button>
          <Button className={styles.refreshButton} size="sm" variant="corporate" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void load()}>Actualizar</Button>
        </div>
      </header>

      <div className={styles.filters}>
        <label className={styles.searchField}><span>Buscar</span><div><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Colaborador, código, cargo o sede..." /></div></label>
        <label className={styles.selectField}><span>Situación</span><select aria-label="Filtrar por situación operativa" value={status} onChange={event => setStatus(event.target.value)}><option value="TODOS">Todas las situaciones</option><option value="REQUIERE_ATENCION">Requiere atención</option><option value="JUSTIFICACION_PENDIENTE">Justificación por revisar</option><option value="JUSTIFICACION_APROBADA">Justificación aprobada</option><option value="JUSTIFICACION_RECHAZADA">Justificación no aprobada</option><option value="PENDIENTE_ENTRADA">Pendiente de entrada</option><option value="ENTRADA_RETRASADA">Entrada retrasada</option><option value="EN_JORNADA">En jornada</option><option value="EN_ALMUERZO">En almuerzo</option><option value="REGRESO_RETRASADO">Regreso retrasado</option><option value="SALIDA_PENDIENTE">Salida pendiente</option><option value="JORNADA_COMPLETADA">Jornada completa</option><option value="JORNADA_INCOMPLETA">Jornada incompleta</option><option value="FALTA">Faltas</option><option value="PERMISO">Permisos</option><option value="VACACIONES">Vacaciones</option><option value="NO_LABORABLE">No laborable</option></select></label>
        <label className={styles.dateField}><span>Fecha operativa</span><div><CalendarDays size={15} /><input aria-label="Fecha de asistencia" type="date" max={businessToday()} value={date} onChange={event => onDateChange?.(event.target.value)} /></div></label>
        <div className={styles.resultCount}><strong>{visibleEmployees.length}</strong><span>{visibleEmployees.length === 1 ? 'resultado' : 'resultados'}</span></div>
      </div>

      {loading && !dashboard ? <PageLoader compact label="Consultando asistencia" />
        : error ? <div className={styles.tableError} role="alert"><p>{getApiErrorMessage(error, 'No se pudo consultar la asistencia.')}</p><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></div>
        : <div className={styles.tableWrap}><table className={styles.table} aria-label="Control diario de asistencia">
          <colgroup>
            <col className={styles.colEmployee} />
            {siteId === null && <col className={styles.colSite} />}
            <col className={styles.colSchedule} />
            <col className={styles.colClock} span={4} />
            <col className={styles.colStatus} />
            <col className={styles.colDelay} />
            <col className={styles.colOvertime} />
            <col className={styles.colActions} />
          </colgroup>
          <thead><tr>
          {sortableHeader('employee', 'Colaborador')}{siteId === null && sortableHeader('site', 'Sede')}{sortableHeader('schedule', 'Horario')}{sortableHeader('entry', 'Entrada')}<th>Salida almuerzo</th><th>Regreso</th><th>Salida final</th>{sortableHeader('status', 'Situación')}{sortableHeader('delay', 'Tardanza')}{sortableHeader('overtime', 'Horas extra')}<th className={styles.actionsHeading}>Acciones</th>
        </tr></thead><tbody>
          {visibleEmployees.map(employee => {
            const profile = employeeById.get(employee.employee_id);
            return <tr key={employee.employee_id} className={employee.requires_attention ? styles.attentionRow : undefined}>
              <td><div className={styles.identity}>{profile ? <img src={getEmployeePhotoUrl(profile)} alt={profile.foto ? `Foto de ${employee.names} ${employee.last_names}` : ''} loading="lazy" onError={employeePhotoFallbackHandler(profile)} /> : <span className={styles.avatarFallback}>{employee.names.charAt(0)}{employee.last_names.charAt(0)}</span>}<div><strong>{employee.names} {employee.last_names}</strong><small>{employee.job_role} · {employee.employee_code}</small></div></div></td>
              {siteId === null && <td><span className={styles.site}><MapPin />{employee.site_name}</span></td>}
              <td>{employee.schedule ? <div className={styles.schedule}><strong>{employee.schedule.name}</strong><small><Clock3 />{formatScheduleRange(employee.schedule.start_time, employee.schedule.end_time)}</small></div> : <span className={styles.noSchedule}>Sin asignar</span>}</td>
              <td className={styles.clock}>{clock(employee.marks.entry)}</td><td className={styles.clock}>{clock(employee.marks.lunch_out)}</td><td className={styles.clock}>{clock(employee.marks.lunch_return)}</td><td className={styles.clock}>{clock(employee.marks.exit)}</td><td><Status employee={employee} /></td><td className={employee.delay_minutes ? styles.delay : styles.emptyValue}>{employee.delay_minutes ? <span className={styles.delayStack}><strong>{formatDurationMinutes(employee.delay_minutes)}</strong>{employee.justification && <small className={styles[`justification${employee.justification.status}`]}>{employee.justification.status === 'APROBADA' ? 'Justificada' : employee.justification.status === 'PENDIENTE' ? 'En revisión' : employee.justification.status === 'RECHAZADA' ? 'No aprobada' : 'Cancelada'}</small>}</span> : '—'}</td><td className={(employee.overtime_minutes || employee.overtime_review_pending) ? styles.overtime : styles.emptyValue}>{employee.overtime_review_pending ? <span className={styles.overtimePending}><strong>{formatDurationMinutes(employee.overtime_pending_minutes ?? employee.overtime_detected_minutes ?? 0)}</strong><small>Por aprobar</small></span> : employee.overtime_minutes ? formatDurationMinutes(employee.overtime_minutes) : '—'}</td>
              <td className={styles.actionsCell}>
                <button
                  type="button"
                  data-tooltip="Ver historial semanal o mensual"
                  aria-label={`Ver historial de ${employee.names}`}
                  onClick={() => setReportEmployeeId(employee.employee_id)}
                  className={styles.historyAction}
                >
                  <CalendarRange />
                </button>
                <button
                  type="button"
                  data-tooltip="Ver expediente del día"
                  aria-label={`Ver asistencia de ${employee.names}`}
                  onClick={() => setViewing(employee)}
                  className={`${styles.viewAction} ${(employee.overtime_review_pending || employee.requires_attention) ? styles.reviewAction : ''}`.trim()}
                >
                  <Eye />
                </button>
                {canManage && <button
                  type="button"
                  className={styles.editAction}
                  data-tooltip="Corregir asistencia"
                  aria-label={`Corregir asistencia de ${employee.names}`}
                  onClick={() => setCorrecting(employee)}
                >
                  <PencilLine />
                </button>}
              </td>
            </tr>;
          })}
          {!visibleEmployees.length && <tr><td colSpan={10 + (siteId === null ? 1 : 0)}><div className={styles.emptyState}><Search /><strong>Sin resultados</strong><span>No hay colaboradores que coincidan con los filtros seleccionados.</span></div></td></tr>}
        </tbody></table></div>}
      <footer className={styles.tableFooter}><span><Building2 />{scopeLabel}</span><small>Información actualizada desde las marcaciones registradas</small></footer>
    </article>

    <AttendanceCorrectionModal siteId={correcting?.site_id ?? siteId ?? 0} date={date} employee={correcting} onClose={() => setCorrecting(null)} onSaved={() => load()} />
    <AttendanceDetailModal employee={viewing} profile={viewing ? employeeById.get(viewing.employee_id) : undefined} date={date} canManage={canManage} onClose={() => setViewing(null)} onChanged={() => void load()} />
    {reportEmployeeId !== undefined && <EmployeeAttendanceReportModal employees={employeeDirectory} initialEmployeeId={reportEmployeeId} onClose={() => setReportEmployeeId(undefined)} />}
  </div>;
}
