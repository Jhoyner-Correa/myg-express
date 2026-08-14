import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Camera, Check, Eye, MapPin, ShieldAlert, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { BiometricContingency } from '../types';
import styles from '../Rrhh.module.css';

const CLOCK_LABELS: Record<BiometricContingency['clock_type'], string> = {
  ENTRADA: 'Entrada',
  SALIDA_ALMUERZO: 'Salida a almuerzo',
  REGRESO: 'Regreso de almuerzo',
  SALIDA: 'Salida final',
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

export function BiometricReviewPanel({ siteId, canManage, onResolved }: {
  siteId: number;
  canManage: boolean;
  onResolved: () => void | Promise<void>;
}) {
  const [requests, setRequests] = useState<BiometricContingency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
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

  return <article className={`${styles.card} ${styles.reviewQueue}`}>
    <header className={styles.toolbar}>
      <div className={styles.reviewHeading}><span><Camera /></span><div><h2>Verificación por selfie</h2><p>Marcaciones provisionales que requieren una decisión administrativa.</p></div></div>
      <strong className={styles.reviewCount}>{requests.length} pendientes</strong>
    </header>
    {error ? <div className={styles.reviewError}><span>{getApiErrorMessage(error, 'No se pudo consultar la bandeja.')}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Reintentar</Button></div>
      : loading ? <div className={styles.reviewLoading}>Consultando solicitudes...</div>
      : !requests.length ? <div className={styles.reviewEmpty}><Check size={16} />No hay selfies pendientes de revisión.</div>
      : <div className={styles.reviewList}>{requests.map(request => <div className={styles.reviewRow} key={request.id}>
        <div className={styles.person}><span>{request.employee_names.charAt(0)}{request.employee_last_names.charAt(0)}</span><div><strong>{request.employee_names} {request.employee_last_names}</strong><small>{request.job_role} · {request.employee_code}</small></div></div>
        <div><small>Marcación solicitada</small><strong>{CLOCK_LABELS[request.clock_type]}</strong></div>
        <div><small>Capturada</small><strong>{dateTime(request.captured_at)}</strong></div>
        <div><small>Validación GPS</small><strong><MapPin size={12} />{Math.round(request.distance_meters)} m · ±{Math.round(request.accuracy_meters)} m</strong></div>
        {canManage
          ? <Button size="sm" variant="secondary" icon={<Eye size={14} />} onClick={() => setSelected(request)}>Revisar</Button>
          : <span className={styles.reviewReadOnly}>Solo lectura</span>}
      </div>)}</div>}
    <BiometricReviewModal request={selected} siteId={siteId} canManage={canManage} onClose={() => setSelected(null)} onResolved={resolved} />
  </article>;
}

function BiometricReviewModal({ request, siteId, canManage, onClose, onResolved }: {
  request: BiometricContingency | null;
  siteId: number;
  canManage: boolean;
  onClose: () => void;
  onResolved: () => void | Promise<void>;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [comment, setComment] = useState('Identidad y contexto verificados.');
  const [saving, setSaving] = useState<'APROBAR' | 'RECHAZAR' | null>(null);

  useEffect(() => {
    if (!request) { setImageUrl(null); return; }
    const controller = new AbortController();
    let currentUrl: string | null = null;
    setImageUrl(null); setImageError(null); setComment('Identidad y contexto verificados.');
    void rrhhService.getBiometricEvidence(request.id, siteId, controller.signal).then(blob => {
      currentUrl = URL.createObjectURL(blob); setImageUrl(currentUrl);
    }).catch(error => { if (!axios.isCancel(error)) setImageError(getApiErrorMessage(error, 'No se pudo cargar la evidencia.')); });
    return () => { controller.abort(); if (currentUrl) URL.revokeObjectURL(currentUrl); };
  }, [request, siteId]);

  const resolve = async (decision: 'APROBAR' | 'RECHAZAR') => {
    if (!request || comment.trim().length < 3) return;
    setSaving(decision);
    try {
      await rrhhService.resolveBiometricContingency(request.id, { sede_id: siteId, decision, comment: comment.trim() });
      showToast(decision === 'APROBAR' ? 'Marcación aprobada y registrada.' : 'Solicitud rechazada.', 'success');
      await onResolved();
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo resolver la solicitud.'), 'error');
    } finally { setSaving(null); }
  };

  return <Modal open={Boolean(request)} onClose={onClose} title="Revisar marcación con selfie" description="La imagen es evidencia de contingencia y requiere validación humana." maxWidth={760}
    footer={<><Button variant="secondary" onClick={onClose}>Cerrar</Button>{canManage && <><Button variant="danger" icon={<X size={15} />} loading={saving === 'RECHAZAR'} disabled={saving !== null || comment.trim().length < 3} onClick={() => void resolve('RECHAZAR')}>Rechazar</Button><Button icon={<Check size={15} />} loading={saving === 'APROBAR'} disabled={saving !== null || comment.trim().length < 3} onClick={() => void resolve('APROBAR')}>Aprobar marcación</Button></>}</>}>
    {request && <div className={styles.reviewModal}>
      <div className={styles.evidenceFrame}>{imageUrl ? <img src={imageUrl} alt={`Selfie de ${request.employee_names} ${request.employee_last_names}`} /> : imageError ? <div>{imageError}</div> : <div>Cargando evidencia privada...</div>}</div>
      <div className={styles.reviewDetails}>
        <div><small>Colaborador</small><strong>{request.employee_names} {request.employee_last_names}</strong><span>{request.job_role} · {request.employee_code}</span></div>
        <div className={styles.reviewFacts}><span><small>Marcación</small><strong>{CLOCK_LABELS[request.clock_type]}</strong></span><span><small>Hora capturada</small><strong>{dateTime(request.captured_at)}</strong></span><span><small>Distancia</small><strong>{Math.round(request.distance_meters)} m del local</strong></span><span><small>Precisión</small><strong>±{Math.round(request.accuracy_meters)} m</strong></span></div>
        <div className={styles.reviewNotice}><ShieldAlert size={17} /><p>Compara el rostro con el colaborador y revisa hora, sede y ubicación antes de decidir.</p></div>
        {canManage && <label className={styles.reviewComment}>Comentario de auditoría<textarea maxLength={500} rows={3} value={comment} onChange={event => setComment(event.target.value)} /></label>}
      </div>
    </div>}
  </Modal>;
}
