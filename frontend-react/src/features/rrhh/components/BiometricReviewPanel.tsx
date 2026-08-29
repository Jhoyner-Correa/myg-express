import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Ban, CalendarClock, Camera, Check, CircleCheck, CircleX, Eye, History, MapPin, MessageSquareText, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import selfieVerificationImage from '../../../assets/rrhh/selfie-verification.png';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { BiometricContingency } from '../types';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';
import styles from '../Rrhh.module.css';

const CLOCK_LABELS: Record<BiometricContingency['clock_type'], string> = {
  ENTRADA: 'Entrada',
  SALIDA_ALMUERZO: 'Salida a almuerzo',
  REGRESO: 'Regreso de almuerzo',
  SALIDA: 'Salida final',
};

const REVIEW_STATUS: Record<BiometricContingency['status'], string> = {
  PENDIENTE: 'Pendiente',
  APROBADA: 'Aprobada',
  RECHAZADA: 'Rechazada',
  CANCELADA: 'Cancelada',
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

function reviewStatusIcon(status: BiometricContingency['status']) {
  if (status === 'APROBADA') return <CircleCheck aria-hidden="true" />;
  if (status === 'RECHAZADA') return <CircleX aria-hidden="true" />;
  return <Ban aria-hidden="true" />;
}

function contingencyAvatar(record: BiometricContingency) {
  return {
    id: record.employee_id,
    sexo: record.employee_sex,
    foto: record.employee_photo,
  };
}

export function BiometricReviewPanel({ siteId, canManage, onResolved }: {
  siteId: number | null;
  canManage: boolean;
  onResolved: () => void | Promise<void>;
}) {
  const [requests, setRequests] = useState<BiometricContingency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueView, setQueueView] = useState<'pending' | 'history'>('pending');
  const [history, setHistory] = useState<BiometricContingency[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [selected, setSelected] = useState<BiometricContingency | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setRequests(await rrhhService.getBiometricContingencies(siteId, signal)); }
    catch (loadError) { if (!axios.isCancel(loadError)) setError(loadError); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [siteId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const resolved = async () => {
    setSelected(null);
    await Promise.all([load(), onResolved()]);
  };

  const openHistory = async () => {
    setQueueView('history');
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const records = await rrhhService.getBiometricContingencyHistory(siteId);
      setHistory(records.filter(record => record.status !== 'PENDIENTE'));
    } catch (loadError) {
      setHistoryError(loadError);
    } finally {
      setHistoryLoading(false);
    }
  };

  return <>
    <button
      className={styles.reviewTrigger}
      data-pending={requests.length > 0 || undefined}
      type="button"
      aria-label={`Abrir revisión de selfies: ${requests.length} pendientes`}
      onClick={() => { setQueueView('pending'); setQueueOpen(true); }}
    >
      <Camera aria-hidden="true" />
      <span>Revisión de selfies</span>
      <strong aria-live="polite">{loading ? '…' : requests.length}</strong>
    </button>
    <Modal
      open={queueOpen}
      onClose={() => setQueueOpen(false)}
      title={queueView === 'pending' ? 'Verificación por selfie' : 'Historial de verificaciones'}
      description={queueView === 'pending' ? 'Control de marcaciones provisionales.' : 'Decisiones administrativas registradas.'}
      icon={<ShieldCheck />}
      headerAccessory={queueView === 'pending' ? <span className={styles.reviewHeaderBadge}>{requests.length} pendientes</span> : undefined}
      maxWidth={queueView === 'pending' && !requests.length ? 520 : 940}
    >
      <div className={styles.reviewQueueBody}>
        {queueView === 'history' ? <div className={styles.reviewHistory}>
          <div className={styles.reviewHistoryToolbar}>
            <button className={styles.reviewBack} type="button" onClick={() => setQueueView('pending')}><ArrowLeft />Volver a pendientes</button>
            {!historyLoading && !historyError && <span><History aria-hidden="true" />{history.length} {history.length === 1 ? 'verificación' : 'verificaciones'}</span>}
          </div>
          {historyError ? <div className={styles.reviewError}><span>{getApiErrorMessage(historyError, 'No se pudo consultar el historial.')}</span><Button size="sm" variant="secondary" onClick={() => void openHistory()}>Reintentar</Button></div>
            : historyLoading ? <div className={styles.reviewLoading}>Consultando historial...</div>
            : !history.length ? <div className={styles.reviewHistoryEmpty}><History /><strong>Sin verificaciones anteriores</strong><span>Las decisiones aprobadas o rechazadas aparecerán aquí.</span></div>
            : <div className={styles.reviewHistoryList}>{history.map(record => <article key={record.id}>
              <div className={`${styles.person} ${styles.reviewHistoryPerson}`}><img src={getEmployeePhotoUrl(contingencyAvatar(record))} alt={record.employee_photo ? `Foto de ${record.employee_names} ${record.employee_last_names}` : ''} onError={employeePhotoFallbackHandler(contingencyAvatar(record))} /><div><strong>{record.employee_names} {record.employee_last_names}</strong><small>{record.site_name} · {CLOCK_LABELS[record.clock_type]}</small></div></div>
              <div className={styles.reviewHistoryDecision}>
                <span className={styles[`reviewStatus${record.status}`]}>{reviewStatusIcon(record.status)}{REVIEW_STATUS[record.status]}</span>
                <time dateTime={record.reviewed_at ?? record.created_at}><CalendarClock aria-hidden="true" />{dateTime(record.reviewed_at ?? record.created_at)}</time>
                {record.evidence_available
                  ? <button className={styles.reviewEvidenceAction} type="button" onClick={() => { setQueueOpen(false); setSelected(record); }}><Eye aria-hidden="true" />Ver evidencia</button>
                  : <small className={styles.reviewEvidenceDeleted}><ShieldCheck aria-hidden="true" />Evidencia eliminada por privacidad</small>}
              </div>
              <div className={styles.reviewHistoryComment}><MessageSquareText aria-hidden="true" /><div><small>Comentario administrativo</small><p>{record.review_comment || 'Sin comentario administrativo.'}</p></div></div>
            </article>)}</div>}
        </div> : error ? <div className={styles.reviewError}><span>{getApiErrorMessage(error, 'No se pudo consultar la bandeja.')}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></div>
          : loading ? <div className={styles.reviewLoading}>Consultando solicitudes...</div>
          : !requests.length ? <div className={styles.reviewEmpty}>
            <img className={styles.reviewIllustration} src={selfieVerificationImage} alt="" aria-hidden="true" />
            <strong>No hay selfies pendientes</strong>
            <p>No hay marcaciones provisionales esperando revisión.</p>
            <button className={styles.reviewHistoryButton} type="button" onClick={() => void openHistory()}><History />Ver historial de verificaciones</button>
          </div>
          : <><div className={styles.reviewList}>{requests.map(request => <div className={styles.reviewRow} key={request.id}>
            <div className={`${styles.person} ${styles.reviewHistoryPerson}`}><img src={getEmployeePhotoUrl(contingencyAvatar(request))} alt={request.employee_photo ? `Foto de ${request.employee_names} ${request.employee_last_names}` : ''} onError={employeePhotoFallbackHandler(contingencyAvatar(request))} /><div><strong>{request.employee_names} {request.employee_last_names}</strong><small>{request.job_role} · {request.employee_code} · {request.site_name}</small></div></div>
            <div><small>Marcación solicitada</small><strong>{CLOCK_LABELS[request.clock_type]}</strong></div>
            <div><small>Capturada</small><strong>{dateTime(request.captured_at)}</strong></div>
            <div><small>Validación GPS</small><strong><MapPin size={12} />{Math.round(request.distance_meters)} m · ±{Math.round(request.accuracy_meters)} m</strong></div>
            {canManage
              ? <Button size="sm" variant="secondary" icon={<Eye size={14} />} onClick={() => { setQueueOpen(false); setSelected(request); }}>Revisar</Button>
              : <span className={styles.reviewReadOnly}>Solo lectura</span>}
          </div>)}</div><div className={styles.reviewQueueFooter}><button type="button" onClick={() => void openHistory()}><History />Ver historial de verificaciones</button></div></>}
      </div>
    </Modal>
    <BiometricReviewModal request={selected} canManage={canManage} onClose={() => setSelected(null)} onResolved={resolved} />
  </>;
}

function BiometricReviewModal({ request, canManage, onClose, onResolved }: {
  request: BiometricContingency | null;
  canManage: boolean;
  onClose: () => void;
  onResolved: () => void | Promise<void>;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [comment, setComment] = useState('Identidad y contexto verificados.');
  const [saving, setSaving] = useState<'APROBAR' | 'RECHAZAR' | null>(null);
  const canResolve = Boolean(canManage && request?.status === 'PENDIENTE');

  useEffect(() => {
    if (!request) { setImageUrl(null); return; }
    const controller = new AbortController();
    let currentUrl: string | null = null;
    setImageUrl(null); setImageError(null); setComment('Identidad y contexto verificados.');
    void rrhhService.getBiometricEvidence(request.id, request.site_id, controller.signal).then(blob => {
      currentUrl = URL.createObjectURL(blob); setImageUrl(currentUrl);
    }).catch(error => { if (!axios.isCancel(error)) setImageError(getApiErrorMessage(error, 'No se pudo cargar la evidencia.')); });
    return () => { controller.abort(); if (currentUrl) URL.revokeObjectURL(currentUrl); };
  }, [request]);

  const resolve = async (decision: 'APROBAR' | 'RECHAZAR') => {
    if (!request || comment.trim().length < 3) return;
    setSaving(decision);
    try {
      await rrhhService.resolveBiometricContingency(request.id, { sede_id: request.site_id, decision, comment: comment.trim() });
      showToast(decision === 'APROBAR' ? 'Marcación aprobada y registrada.' : 'Solicitud rechazada.', 'success');
      await onResolved();
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo resolver la solicitud.'), 'error');
    } finally { setSaving(null); }
  };

  return <Modal open={Boolean(request)} onClose={onClose}
    title={canResolve ? 'Revisar marcación con selfie' : 'Evidencia de verificación'}
    description={canResolve ? 'La imagen es evidencia de contingencia y requiere validación humana.' : 'Consulta privada de la evidencia conservada temporalmente.'}
    maxWidth={760}
    footer={<><Button variant="secondary" onClick={onClose}>Cerrar</Button>{canResolve && <><Button variant="danger" icon={<X size={15} />} loading={saving === 'RECHAZAR'} disabled={saving !== null || comment.trim().length < 3} onClick={() => void resolve('RECHAZAR')}>Rechazar</Button><Button icon={<Check size={15} />} loading={saving === 'APROBAR'} disabled={saving !== null || comment.trim().length < 3} onClick={() => void resolve('APROBAR')}>Aprobar marcación</Button></>}</>}>
    {request && <div className={styles.reviewModal}>
      <div className={styles.evidenceFrame}>{imageUrl ? <img src={imageUrl} alt={`Selfie de ${request.employee_names} ${request.employee_last_names}`} /> : imageError ? <div>{imageError}</div> : <div>Cargando evidencia privada...</div>}</div>
      <div className={styles.reviewDetails}>
        <div><small>Colaborador</small><strong>{request.employee_names} {request.employee_last_names}</strong><span>{request.job_role} · {request.employee_code}</span></div>
        <div className={styles.reviewFacts}><span><small>Marcación</small><strong>{CLOCK_LABELS[request.clock_type]}</strong></span><span><small>Hora capturada</small><strong>{dateTime(request.captured_at)}</strong></span><span><small>Distancia</small><strong>{Math.round(request.distance_meters)} m del local</strong></span><span><small>Precisión</small><strong>±{Math.round(request.accuracy_meters)} m</strong></span></div>
        <div className={styles.reviewNotice}><ShieldAlert size={17} /><p>Compara el rostro con el colaborador y revisa hora, sede y ubicación antes de decidir.</p></div>
        {canResolve
          ? <label className={styles.reviewComment}>Comentario de auditoría<textarea maxLength={500} rows={3} value={comment} onChange={event => setComment(event.target.value)} /></label>
          : <div className={styles.reviewNotice}><ShieldCheck size={17} /><p>Esta evidencia se conserva durante siete días desde la decisión y luego se elimina automáticamente.</p></div>}
      </div>
    </div>}
  </Modal>;
}
