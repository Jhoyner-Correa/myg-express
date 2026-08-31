import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle, CheckCircle2, Clock3, Eye, FileCheck2, FileImage, Fingerprint, MapPin,
  ShieldCheck, TimerReset, UserRound, X, XCircle,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { AttendanceDashboardEmployee, AttendanceDetail, Employee, OvertimeRequest } from '../types';
import { formatDurationMinutes, formatScheduleRange } from './attendance-formatters';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';
import styles from './AttendanceDetailModal.module.css';

const MARK_LABELS = {
  ENTRADA: 'Entrada', SALIDA_ALMUERZO: 'Salida a almuerzo', REGRESO: 'Regreso', SALIDA: 'Salida final',
} as const;

function formatClock(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

function OvertimeReviewCard({ request, siteId, canManage, onResolved }: {
  request: OvertimeRequest; siteId: number; canManage: boolean; onResolved: () => void;
}) {
  const [minutes, setMinutes] = useState(request.minutos_detectados);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState<'APROBAR' | 'RECHAZAR' | null>(null);
  const pending = request.estado === 'PENDIENTE';
  const segmentClosed = request.marcacion_id !== null;
  const openEvidence = async () => {
    try {
      const blob = await rrhhService.getOvertimeEvidence(request.id, siteId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo abrir la foto de sustento.'), 'error');
    }
  };
  const resolve = async (decision: 'APROBAR' | 'RECHAZAR') => {
    setSaving(decision);
    try {
      await rrhhService.reviewOvertime(request.id, {
        sede_id: siteId,
        decision,
        ...(decision === 'APROBAR' ? { approved_minutes: minutes } : {}),
        comment,
      });
      showToast(decision === 'APROBAR' ? 'Horas extra aprobadas y auditadas.' : 'Horas extra rechazadas.', 'success');
      onResolved();
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo resolver la revisión de horas extra.'), 'error');
    } finally { setSaving(null); }
  };

  return <article className={styles.overtimeCard}>
    <div className={styles.overtimeHeading}>
      <span><TimerReset /></span>
      <div><strong>{request.tipo_evento === 'SALIDA_POSTERIOR' ? 'Salida posterior al horario' : 'Trabajo durante el almuerzo'}</strong><small>{segmentClosed ? `Duración calculada: ${formatDurationMinutes(request.minutos_detectados)}` : 'Jornada abierta · duración provisional'}</small></div>
      <em className={styles[`review${request.estado}`]}>{request.estado === 'PENDIENTE' ? 'Pendiente' : request.estado === 'APROBADO' ? 'Aprobada' : 'Rechazada'}</em>
    </div>
    {request.origen === 'DECLARACION_EMPLEADO' && <div className={styles.employeeEvidence}>
      <FileImage />
      <div><small>Sustento del colaborador</small><strong>{request.comentario_empleado ?? 'Sin comentario'}</strong>{request.declarado_en && <span>Enviado {formatDateTime(request.declarado_en)}</span>}</div>
      {Boolean(request.tiene_sustento) && <Button size="sm" variant="secondary" icon={<Eye />} onClick={() => void openEvidence()}>Ver foto</Button>}
    </div>}
    {pending && canManage ? <div className={styles.reviewForm}>
      <label><span>Tiempo a reconocer</span><div><input type="number" min={1} max={request.minutos_detectados} value={minutes} onChange={event => setMinutes(Number(event.target.value))} /><small>min</small></div></label>
      <label className={styles.commentField}><span>Sustento administrativo</span><textarea maxLength={500} value={comment} onChange={event => setComment(event.target.value)} placeholder="Indica la autorización, necesidad operativa o motivo del rechazo..." /></label>
      <div className={styles.reviewActions}>
        <Button size="sm" variant="secondary" icon={<XCircle />} loading={saving === 'RECHAZAR'} disabled={comment.trim().length < 8 || saving !== null} onClick={() => void resolve('RECHAZAR')}>Rechazar</Button>
        <Button size="sm" variant="corporate" icon={<CheckCircle2 />} loading={saving === 'APROBAR'} disabled={!segmentClosed || comment.trim().length < 8 || minutes < 1 || minutes > request.minutos_detectados || saving !== null} onClick={() => void resolve('APROBAR')}>Aprobar tiempo</Button>
      </div>
      {!segmentClosed && <p className={styles.openSegmentNotice}>La aprobación se habilitará cuando el colaborador registre la marcación de cierre.</p>}
    </div> : <div className={styles.reviewResult}>
      <strong>{request.estado === 'APROBADO' ? `${formatDurationMinutes(request.minutos_aprobados ?? request.minutos_detectados)} reconocidas` : request.estado === 'RECHAZADO' ? 'No computa como hora extra' : 'Esperando decisión administrativa'}</strong>
      {request.comentario_revision && <p>{request.comentario_revision}</p>}
      {request.revisado_en && <small>{request.revisado_por_nombre ?? 'Administrador'} · {formatDateTime(request.revisado_en)}</small>}
    </div>}
  </article>;
}

export function AttendanceDetailModal({ employee, profile, date, canManage, onClose, onChanged }: {
  employee: AttendanceDashboardEmployee | null;
  profile?: Employee;
  date: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AttendanceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [incidentComment, setIncidentComment] = useState('');
  const [savingIncident, setSavingIncident] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!employee) return;
    setLoading(true); setError(null);
    try { setDetail(await rrhhService.getAttendanceDetail(employee.site_id, employee.employee_id, date, signal)); }
    catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [date, employee]);

  useEffect(() => {
    if (!employee) { setDetail(null); return; }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [employee, load]);

  useEffect(() => {
    if (!employee) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [employee, onClose]);

  const pendingOvertime = useMemo(() => detail?.overtime_requests.filter(item => item.estado === 'PENDIENTE').length ?? 0, [detail]);
  if (!employee) return null;

  const reviewIncident = async () => {
    setSavingIncident(true);
    try {
      await rrhhService.reviewAttendanceIncident({
        sede_id: employee.site_id, employee_id: employee.employee_id, date,
        incident_type: employee.operational_status, comment: incidentComment,
      });
      showToast('Incidencia revisada y registrada en auditoría.', 'success');
      setIncidentComment(''); await load(); onChanged();
    } catch (reviewError) { showToast(getApiErrorMessage(reviewError, 'No se pudo registrar la revisión.'), 'error'); }
    finally { setSavingIncident(false); }
  };

  return <div className={styles.overlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="attendance-detail-title">
      <header className={styles.header}>
        <div className={styles.person}>
          {profile ? <img src={getEmployeePhotoUrl(profile)} alt="" onError={employeePhotoFallbackHandler(profile)} /> : <span><UserRound /></span>}
          <div><small>{employee.employee_code}</small><h2 id="attendance-detail-title">{employee.names} {employee.last_names}</h2><p>{employee.job_role} · {employee.site_name}</p></div>
        </div>
        <button type="button" aria-label="Cerrar detalle" onClick={onClose}><X /></button>
      </header>

      {loading && !detail ? <PageLoader compact label="Cargando expediente de asistencia" /> : error ? <div className={styles.error}><AlertTriangle /><p>{getApiErrorMessage(error, 'No se pudo cargar el detalle.')}</p><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></div> : detail && <div className={styles.content}>
        <section className={styles.summaryStrip}>
          <div><Clock3 /><span>Fecha operativa<strong>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</strong></span></div>
          <div><ShieldCheck /><span>Resultado<strong>{detail.attendance?.estado_asistencia?.replaceAll('_', ' ') ?? 'Sin registro'}</strong></span></div>
          <div><TimerReset /><span>Horas extra<strong>{pendingOvertime ? `${pendingOvertime} por revisar` : formatDurationMinutes(employee.overtime_minutes)}</strong></span></div>
          {detail.attendance?.hora_entrada && detail.attendance?.hora_salida && <div><FileCheck2 /><span>Horario<strong>{formatScheduleRange(detail.attendance.hora_entrada, detail.attendance.hora_salida)}</strong></span></div>}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}><Clock3 /><div><h3>Marcaciones verificadas</h3><p>Hora real, origen y controles registrados por el sistema.</p></div></div>
          <div className={styles.timeline}>{(['ENTRADA', 'SALIDA_ALMUERZO', 'REGRESO', 'SALIDA'] as const).map(type => {
            const mark = detail.marks.find(item => item.tipo_marcacion === type);
            return <article key={type} className={mark ? styles.markDone : styles.markMissing}>
              <i>{mark ? <CheckCircle2 /> : <Clock3 />}</i><div><small>{MARK_LABELS[type]}</small><strong>{formatClock(mark?.hora_marcacion ?? null)}</strong><span>{mark ? `${mark.origen_marcacion} · ${mark.verificacion_identidad ?? 'Identidad verificada'}` : 'Sin marcación'}</span></div>
              {mark?.distancia_sede_metros != null && <em><MapPin />{Math.round(mark.distancia_sede_metros)} m</em>}
            </article>;
          })}</div>
        </section>

        {detail.overtime_requests.length > 0 && <section className={styles.section}>
          <div className={styles.sectionTitle}><TimerReset /><div><h3>Revisión de horas extra</h3><p>El sistema detecta el tiempo; RR. HH. decide cuánto corresponde reconocer.</p></div></div>
          <div className={styles.overtimeList}>{detail.overtime_requests.map(request => <OvertimeReviewCard key={request.id} request={request} siteId={employee.site_id} canManage={canManage} onResolved={async () => { await load(); onChanged(); }} />)}</div>
        </section>}

        {canManage && employee.requires_attention && <section className={styles.section}>
          <div className={styles.sectionTitle}><AlertTriangle /><div><h3>Cierre de incidencia</h3><p>Documenta la revisión sin alterar las marcaciones. Para cambiar horas utiliza “Corregir”.</p></div></div>
          <div className={styles.incidentForm}><textarea maxLength={500} value={incidentComment} onChange={event => setIncidentComment(event.target.value)} placeholder="Resultado de la revisión, evidencia consultada o instrucción aplicada..." /><Button size="sm" variant="corporate" icon={<FileCheck2 />} loading={savingIncident} disabled={incidentComment.trim().length < 8} onClick={() => void reviewIncident()}>Registrar revisión</Button></div>
        </section>}

        {(detail.corrections.length > 0 || detail.incident_reviews.length > 0) && <section className={styles.audit}>
          <div className={styles.sectionTitle}><Fingerprint /><div><h3>Trazabilidad administrativa</h3><p>Cambios y decisiones conservados para auditoría.</p></div></div>
          {[...detail.corrections.map(item => ({ id: `c-${item.id}`, title: 'Asistencia corregida', text: item.motivo, user: item.corregido_por_nombre, at: item.created_at })), ...detail.incident_reviews.map(item => ({ id: `i-${item.id}`, title: 'Incidencia revisada', text: item.comentario, user: item.revisado_por_nombre, at: item.revisado_en }))].map(item => <div className={styles.auditItem} key={item.id}><CheckCircle2 /><div><strong>{item.title}</strong><p>{item.text}</p></div><small>{item.user} · {formatDateTime(item.at)}</small></div>)}
        </section>}
      </div>}
    </section>
  </div>;
}
