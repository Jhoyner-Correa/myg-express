import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Building2,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  FileCheck2,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { rrhhService } from '../rrhh.service';
import type {
  AbsenceWorkflows,
  AttendanceJustificationRequest,
  Employee,
  PermissionRequest,
  Site,
  VacationRequest,
} from '../types';
import { AbsenceRequestModal } from './AbsenceRequestModal';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';
import { RequestResolutionModal } from './RequestResolutionModal';
import styles from './AbsencePanel.module.css';

type ResolutionTarget =
  | { kind: 'PERMISO'; item: PermissionRequest }
  | { kind: 'VACACIONES'; item: VacationRequest }
  | { kind: 'JUSTIFICACION'; item: AttendanceJustificationRequest };
type RequestKind = 'PERMISO' | 'VACACIONES' | 'JUSTIFICACION';
type View = 'PENDIENTES' | 'TODAS' | 'PERMISOS' | 'JUSTIFICACIONES' | 'VACACIONES';
type AbsencePanelProps = {
  siteId: number | null;
  sites: Site[];
  employees: Employee[];
  canManage: boolean;
  canViewAllSites: boolean;
  onSiteChange: (siteId: number | null) => void;
};
type WorkflowItem = {
  key: string;
  kind: RequestKind;
  source: PermissionRequest | VacationRequest | AttendanceJustificationRequest;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  employeeRole: string;
  siteName: string;
  category: string;
  period: string;
  duration: string;
  reason: string;
  reasonContext?: string;
  statusLabel: string;
  statusTone: 'pending' | 'approved' | 'rejected' | 'neutral';
  pending: boolean;
  canCancel: boolean;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  requestedFromMobile: boolean;
  hasEvidence: boolean;
  evidenceName: string | null;
};

const empty: AbsenceWorkflows = { permissions: [], vacations: [], justifications: [] };
const permissionLabels: Record<PermissionRequest['tipo_permiso'], string> = {
  MEDICO: 'Permiso médico',
  PERSONAL: 'Permiso personal',
  FAMILIAR: 'Permiso familiar',
  OTRO: 'Otro permiso',
};
const justificationCategoryLabels: Record<AttendanceJustificationRequest['categoria'], string> = {
  MEDICO: 'Sustento médico',
  EMERGENCIA_FAMILIAR: 'Emergencia familiar',
  TRANSPORTE: 'Incidencia de transporte',
  OTRO: 'Otro motivo',
};
const vacationStatusLabels: Record<VacationRequest['estado'], string> = {
  SOLICITADA: 'Por revisar',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  PROGRAMADA: 'Programada',
  EN_CURSO: 'En curso',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
};

function peruDate(value: string, options: Intl.DateTimeFormatOptions) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', ...options }).format(parsed);
}
function dateOnly(value: string) {
  return peruDate(`${value.slice(0, 10)}T12:00:00-05:00`, { day: '2-digit', month: 'short', year: 'numeric' });
}
function zonedDateTime(value: string, long = false) {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}-05:00`;
  return peruDate(withZone, {
    day: '2-digit', month: long ? 'long' : 'short', year: long ? 'numeric' : undefined,
    hour: 'numeric', minute: '2-digit',
  });
}
function readableMinutes(total: number) {
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}
function permissionDuration(start: string, end: string) {
  const from = new Date(start.includes('T') ? start : start.replace(' ', 'T'));
  const until = new Date(end.includes('T') ? end : end.replace(' ', 'T'));
  return readableMinutes(Math.max(0, Math.round((until.getTime() - from.getTime()) / 60_000)));
}
function permissionItem(item: PermissionRequest): WorkflowItem {
  const pending = item.estado === 'PENDIENTE';
  const approved = item.estado === 'APROBADO';
  const cancelled = item.estado === 'CANCELADO';
  return {
    key: `permission-${item.id}`, kind: 'PERMISO', source: item, employeeId: item.empleado_id,
    employeeName: `${item.nombres} ${item.apellidos}`, employeeCode: item.codigo_empleado,
    employeeRole: item.cargo_nombre, siteName: item.sede_nombre, category: permissionLabels[item.tipo_permiso],
    period: `${zonedDateTime(item.fecha_inicio)} — ${zonedDateTime(item.fecha_fin)}`,
    duration: permissionDuration(item.fecha_inicio, item.fecha_fin), reason: item.motivo,
    statusLabel: pending ? 'Por revisar' : approved ? 'Aprobado' : cancelled ? 'Cancelado' : 'Rechazado',
    statusTone: pending ? 'pending' : approved ? 'approved' : cancelled ? 'neutral' : 'rejected', pending,
    canCancel: Boolean(item.puede_cancelar),
    resolution: cancelled ? item.motivo_cancelacion : item.comentario_resolucion,
    resolvedAt: cancelled ? item.cancelado_en : item.resuelto_en, createdAt: item.created_at,
    requestedFromMobile: item.origen_solicitud === 'MOVIL', hasEvidence: Boolean(item.tiene_sustento),
    evidenceName: item.sustento_nombre,
  };
}
function vacationItem(item: VacationRequest): WorkflowItem {
  const pending = item.estado === 'SOLICITADA';
  const approved = ['APROBADA', 'PROGRAMADA', 'EN_CURSO', 'COMPLETADA'].includes(item.estado);
  return {
    key: `vacation-${item.id}`, kind: 'VACACIONES', source: item, employeeId: item.empleado_id,
    employeeName: `${item.nombres} ${item.apellidos}`, employeeCode: item.codigo_empleado,
    employeeRole: item.cargo_nombre, siteName: item.sede_nombre, category: 'Vacaciones',
    period: `${dateOnly(item.fecha_inicio)} — ${dateOnly(item.fecha_fin)}`,
    duration: `${item.dias_tomados} ${item.dias_tomados === 1 ? 'día' : 'días'}`,
    reason: item.motivo || 'Sin observaciones adicionales.', statusLabel: vacationStatusLabels[item.estado],
    statusTone: pending ? 'pending' : approved ? 'approved' : ['RECHAZADA', 'CANCELADA'].includes(item.estado) ? 'rejected' : 'neutral',
    pending, canCancel: Boolean(item.puede_cancelar),
    resolution: item.estado === 'CANCELADA' ? item.motivo_cancelacion : item.comentario_revision,
    resolvedAt: item.estado === 'CANCELADA' ? item.cancelado_en : item.revisado_en, createdAt: item.created_at,
    requestedFromMobile: false, hasEvidence: false, evidenceName: null,
  };
}
function justificationItem(item: AttendanceJustificationRequest): WorkflowItem {
  const pending = item.estado === 'PENDIENTE';
  const approved = item.estado === 'APROBADA';
  const cancelled = item.estado === 'CANCELADA';
  return {
    key: `justification-${item.id}`,
    kind: 'JUSTIFICACION',
    source: item,
    employeeId: item.empleado_id,
    employeeName: `${item.nombres} ${item.apellidos}`,
    employeeCode: item.codigo_empleado,
    employeeRole: item.cargo_nombre,
    siteName: item.sede_nombre,
    category: item.tipo_incidencia === 'TARDANZA'
      ? 'Justificación de tardanza'
      : 'Justificación de inasistencia',
    period: dateOnly(item.fecha_incidencia),
    duration: item.tipo_incidencia === 'TARDANZA'
      ? `${readableMinutes(Number(item.minutos_tardanza || 0))} de tardanza`
      : 'Inasistencia registrada',
    reason: item.motivo,
    reasonContext: justificationCategoryLabels[item.categoria],
    statusLabel: pending ? 'Por revisar' : approved ? 'Aprobada' : cancelled ? 'Cancelada' : 'Rechazada',
    statusTone: pending ? 'pending' : approved ? 'approved' : cancelled ? 'neutral' : 'rejected',
    pending,
    canCancel: false,
    resolution: item.comentario_revision,
    resolvedAt: item.revisado_en || item.cancelado_en,
    createdAt: item.created_at,
    requestedFromMobile: item.origen === 'MOVIL',
    hasEvidence: Boolean(item.tiene_sustento),
    evidenceName: item.sustento_nombre,
  };
}
function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE').trim();
}

export function AbsencePanel({ siteId, sites, employees, canManage, canViewAllSites, onSiteChange }: AbsencePanelProps) {
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [target, setTarget] = useState<ResolutionTarget | null>(null);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | 'CANCEL'>('APPROVE');
  const [view, setView] = useState<View>('TODAS');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<WorkflowItem | null>(null);
  const [openingEvidence, setOpeningEvidence] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setData(await rrhhService.getAbsenceWorkflows(siteId, signal)); }
    catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [siteId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const items = useMemo(() => [
    ...data.permissions.map(permissionItem),
    ...data.justifications.map(justificationItem),
    ...data.vacations.map(vacationItem),
  ].sort((a, b) => a.pending !== b.pending ? (a.pending ? -1 : 1) : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [data]);
  const counts = useMemo(() => ({
    pending: items.filter((item) => item.pending).length,
    permissions: items.filter((item) => item.kind === 'PERMISO').length,
    justifications: items.filter((item) => item.kind === 'JUSTIFICACION').length,
    vacations: items.filter((item) => item.kind === 'VACACIONES').length,
    resolved: items.filter((item) => !item.pending).length,
  }), [items]);
  const visibleItems = useMemo(() => {
    const search = normalizeSearch(query);
    return items.filter((item) => {
      if (view === 'PENDIENTES' && !item.pending) return false;
      if (view === 'PERMISOS' && item.kind !== 'PERMISO') return false;
      if (view === 'JUSTIFICACIONES' && item.kind !== 'JUSTIFICACION') return false;
      if (view === 'VACACIONES' && item.kind !== 'VACACIONES') return false;
      return !search || normalizeSearch([item.employeeName, item.employeeCode, item.employeeRole, item.siteName, item.category, item.reason, item.statusLabel].join(' ')).includes(search);
    });
  }, [items, query, view]);

  const openResolution = (item: WorkflowItem, nextDecision: 'APPROVE' | 'REJECT' | 'CANCEL') => {
    setTarget(item.kind === 'PERMISO'
      ? { kind: 'PERMISO', item: item.source as PermissionRequest }
      : item.kind === 'JUSTIFICACION'
        ? { kind: 'JUSTIFICACION', item: item.source as AttendanceJustificationRequest }
        : { kind: 'VACACIONES', item: item.source as VacationRequest });
    setDecision(nextDecision);
  };
  const employeeFor = (item: WorkflowItem) => employees.find((employee) => employee.id === item.employeeId);
  const detailEmployee = detail ? employeeFor(detail) : undefined;
  const openEvidence = async (item: WorkflowItem) => {
    if (item.kind === 'VACACIONES' || !item.hasEvidence) return;
    setOpeningEvidence(true);
    try {
      const blob = item.kind === 'JUSTIFICACION'
        ? await rrhhService.getAttendanceJustificationEvidence(item.source.id, item.source.sede_id)
        : await rrhhService.getPermissionEvidence(item.source.id, item.source.sede_id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (evidenceError) {
      setError(evidenceError);
    } finally {
      setOpeningEvidence(false);
    }
  };

  return <div className={styles.page}>
    <section className={styles.executiveSummary} aria-label="Resumen de solicitudes">
      <header className={styles.summaryLead}>
        <span className={styles.summaryIcon}><FileCheck2 /></span>
        <div><small>CONTROL DOCUMENTAL</small><strong>Estado de solicitudes</strong><p>Seguimiento del alcance seleccionado</p></div>
      </header>
      <div className={styles.metrics}>
        <article className={styles.metricPending}><span className={styles.metricIcon}><Clock3 /></span><div><small>Por revisar</small><strong>{counts.pending}</strong><p>Esperan una decisión</p></div></article>
        <article className={styles.metricPermission}><span className={styles.metricIcon}><Stethoscope /></span><div><small>Permisos</small><strong>{counts.permissions}</strong><p>Solicitudes preventivas</p></div></article>
        <article className={styles.metricVacation}><span className={styles.metricIcon}><CalendarRange /></span><div><small>Vacaciones</small><strong>{counts.vacations}</strong><p>Solicitudes registradas</p></div></article>
        <article className={styles.metricResolved}><span className={styles.metricIcon}><FileCheck2 /></span><div><small>Resueltas</small><strong>{counts.resolved}</strong><p>Con trazabilidad</p></div></article>
      </div>
    </section>

    <article className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div><span className={styles.eyebrow}>GESTIÓN ADMINISTRATIVA</span><h2>Centro de solicitudes</h2><p>Revisa permisos, justificaciones y vacaciones desde una sola bandeja.</p></div>
        <div className={styles.headerActions}>
          <label className={styles.scopePicker}>
            <Building2 aria-hidden="true" />
            <select aria-label="Alcance de sede" value={siteId ?? 'all'} onChange={(event) => onSiteChange(event.target.value === 'all' ? null : Number(event.target.value))}>
              {canViewAllSites && <option value="all">Todas las sedes</option>}
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={15} />} loading={loading} onClick={() => void load()}>Actualizar</Button>
          {canManage && <Button size="sm" icon={<Plus size={16} />} onClick={() => setCreating(true)}>Nueva solicitud</Button>}
        </div>
      </header>

      <div className={styles.controls}>
        <nav className={styles.views} aria-label="Vistas de solicitudes">
          {([['PENDIENTES', 'Por revisar', counts.pending], ['TODAS', 'Todas', items.length], ['PERMISOS', 'Permisos', counts.permissions], ['JUSTIFICACIONES', 'Justificaciones', counts.justifications], ['VACACIONES', 'Vacaciones', counts.vacations]] as const).map(([value, label, count]) =>
            <button key={value} type="button" className={view === value ? styles.viewActive : ''} aria-pressed={view === value} onClick={() => setView(value)}>{label}<span>{count}</span></button>)}
        </nav>
        <label className={styles.search}><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar colaborador, sede o motivo..." aria-label="Buscar solicitudes" /></label>
      </div>

      {loading && !items.length ? <PageLoader compact label="Consultando solicitudes" /> : error ?
        <div className={styles.errorState}><p>{getApiErrorMessage(error, 'No se pudieron consultar las solicitudes.')}</p><Button variant="secondary" size="sm" onClick={() => void load()}>Reintentar</Button></div> :
        visibleItems.length ? <div className={styles.tableScroll}><table className={styles.requestTable}>
          <thead><tr><th>Colaborador</th><th>Solicitud</th><th>Periodo</th><th>Estado</th><th>Resolución</th><th className={styles.actionsHeading}>Acciones</th></tr></thead>
          <tbody>{visibleItems.map((item) => {
            const employee = employeeFor(item);
            return <tr key={item.key} className={item.pending ? styles.pendingRow : ''}>
              <td><div className={styles.employee}>{employee ? <img src={getEmployeePhotoUrl(employee)} alt="" onError={employeePhotoFallbackHandler(employee)} /> : <span>{item.employeeName.split(' ').slice(0, 2).map((part) => part[0]).join('')}</span>}<div><strong>{item.employeeName}</strong><small>{item.employeeRole} · {item.employeeCode}</small></div></div></td>
              <td><div className={styles.requestType}>{item.kind === 'PERMISO' ? <Stethoscope /> : item.kind === 'JUSTIFICACION' ? <FileCheck2 /> : <CalendarDays />}<div><strong>{item.category}</strong><small>{item.siteName}</small></div></div></td>
              <td><strong className={styles.period}>{item.period}</strong><small className={styles.duration}>{item.duration}</small></td>
              <td><span className={`${styles.status} ${styles[item.statusTone]}`}><i />{item.statusLabel}</span></td>
              <td><span className={styles.resolution}>{item.pending ? 'Pendiente de decisión' : item.resolution || 'Sin comentario'}</span>{item.resolvedAt && <small className={styles.resolvedAt}>{zonedDateTime(item.resolvedAt)}</small>}</td>
              <td><div className={styles.rowActions}>
                <button type="button" className={styles.viewAction} aria-label={`Ver solicitud de ${item.employeeName}`} data-tooltip="Ver detalle" onClick={() => setDetail(item)}><Eye /></button>
                {canManage && item.pending && <><button type="button" className={styles.approveAction} aria-label={`Aprobar solicitud de ${item.employeeName}`} data-tooltip="Aprobar" onClick={() => openResolution(item, 'APPROVE')}><Check /></button><button type="button" className={styles.rejectAction} aria-label={`Rechazar solicitud de ${item.employeeName}`} data-tooltip="Rechazar" onClick={() => openResolution(item, 'REJECT')}><X /></button></>}
                {canManage && item.kind !== 'JUSTIFICACION' && <button
                  type="button"
                  className={styles.cancelAction}
                  aria-label={item.canCancel ? `Cancelar solicitud de ${item.employeeName}` : `Solicitud de ${item.employeeName} protegida por auditoría`}
                  data-tooltip={item.canCancel ? 'Cancelar solicitud' : 'Solicitud ya aplicada'}
                  disabled={!item.canCancel}
                  onClick={() => openResolution(item, 'CANCEL')}
                ><Trash2 /></button>}
              </div></td>
            </tr>;
          })}</tbody>
        </table></div> : <div className={styles.emptyState}><span><FileCheck2 /></span><h3>{view === 'PENDIENTES' ? 'No hay solicitudes pendientes' : 'No se encontraron solicitudes'}</h3><p>{query ? 'Prueba con otro nombre, sede o motivo.' : 'La bandeja está al día y no requiere decisiones.'}</p></div>}

      <footer className={styles.workspaceFooter}><span>{visibleItems.length} {visibleItems.length === 1 ? 'solicitud visible' : 'solicitudes visibles'}</span><span>{siteId === null ? 'Alcance corporativo' : 'Sede seleccionada'}</span></footer>
    </article>

    <Modal
      open={Boolean(detail)}
      onClose={() => setDetail(null)}
      title="Expediente de solicitud"
      description="Control documental de Recursos Humanos"
      icon={detail?.kind === 'PERMISO' ? <Stethoscope /> : detail?.kind === 'JUSTIFICACION' ? <FileCheck2 /> : <CalendarRange />}
      iconVariant="plain"
      headerAccessory={detail ? <span className={`${styles.status} ${styles[detail.statusTone]}`}><i />{detail.statusLabel}</span> : undefined}
      maxWidth={760}
      footer={detail && <div className={styles.detailFooter}>
        <Button variant="secondary" onClick={() => setDetail(null)}>Cerrar</Button>
        {canManage && <div className={styles.detailDecisionActions}>
          {detail.canCancel && <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => { setDetail(null); openResolution(detail, 'CANCEL'); }}>Cancelar solicitud</Button>}
          {detail.pending && <>
            <Button variant="secondary" icon={<X size={15} />} onClick={() => { setDetail(null); openResolution(detail, 'REJECT'); }}>Rechazar</Button>
            <Button icon={<Check size={15} />} onClick={() => { setDetail(null); openResolution(detail, 'APPROVE'); }}>Aprobar solicitud</Button>
          </>}
        </div>}
      </div>}
    >
      {detail && <div className={styles.detail}>
        <section className={styles.detailHero}>
          <div className={styles.detailEmployee}>
            {detailEmployee
              ? <img src={getEmployeePhotoUrl(detailEmployee)} alt="" onError={employeePhotoFallbackHandler(detailEmployee)} />
              : <span className={styles.detailEmployeeFallback}>{detail.employeeName.split(' ').slice(0, 2).map((part) => part[0]).join('')}</span>}
            <div className={styles.detailEmployeeIdentity}>
              <small>COLABORADOR</small>
              <strong>{detail.employeeName}</strong>
              <p>{detail.employeeCode} · {detail.employeeRole}</p>
              <span className={styles.detailEmployeeSite}><Building2 />{detail.siteName}</span>
            </div>
          </div>
          <div className={styles.detailRequestType}>
            <span>{detail.kind === 'PERMISO' ? <Stethoscope /> : detail.kind === 'JUSTIFICACION' ? <FileCheck2 /> : <CalendarRange />}</span>
            <div><small>TIPO DE SOLICITUD</small><strong>{detail.category}</strong><p>{detail.requestedFromMobile ? 'Enviada desde la aplicación' : 'Registrada por administración'}</p></div>
          </div>
        </section>

        <div className={styles.detailWorkflow} aria-label="Estado de la solicitud">
          <div className={styles.workflowCompleted}><span><Check /></span><strong>Registrada</strong></div>
          <i />
          <div className={detail.pending ? styles.workflowCurrent : styles.workflowCompleted}><span>{detail.pending ? '2' : <Check />}</span><strong>Revisión de RR. HH.</strong></div>
          <i />
          <div className={detail.pending ? styles.workflowWaiting : styles.workflowCompleted}><span>{detail.pending ? '3' : <Check />}</span><strong>Resolución</strong></div>
        </div>

        <dl className={styles.detailFacts}>
          <div><dt><CalendarDays />Periodo solicitado</dt><dd>{detail.period}</dd></div>
          <div><dt><Clock3 />Duración</dt><dd>{detail.duration}</dd></div>
          <div><dt><FileCheck2 />Registrada</dt><dd>{zonedDateTime(detail.createdAt, true)}</dd></div>
          <div><dt><Smartphone />Origen</dt><dd>{detail.requestedFromMobile ? 'Aplicación móvil' : 'Administración'}</dd></div>
        </dl>
        <section className={styles.detailNote}>
          <div className={styles.detailNoteHeading}>
            <small>MOTIVO Y SUSTENTO</small>
            {detail.reasonContext && <span>{detail.reasonContext}</span>}
          </div>
          <p>{detail.reason}</p>
        </section>
        {detail.hasEvidence && <section className={styles.detailEvidence}>
          <Paperclip aria-hidden="true" />
          <div><small>DOCUMENTO ADJUNTO</small><strong>{detail.evidenceName || 'Sustento presentado'}</strong><p><ShieldCheck />Archivo privado para revisión exclusiva de RR. HH.</p></div>
          <Button size="sm" variant="secondary" loading={openingEvidence} onClick={() => void openEvidence(detail)}>Ver sustento</Button>
        </section>}
        {!detail.pending && <section className={styles.detailResolution}><FileCheck2 /><div><small>DECISIÓN ADMINISTRATIVA</small><p>{detail.resolution || 'Resuelta sin comentario adicional.'}</p></div></section>}
      </div>}
    </Modal>

    <AbsenceRequestModal open={creating} siteId={siteId} employees={employees} onClose={() => setCreating(false)} onSaved={() => load()} />
    <RequestResolutionModal siteId={target?.item.sede_id ?? siteId ?? 0} target={target} decision={decision} onClose={() => setTarget(null)} onSaved={() => load()} />
  </div>;
}
