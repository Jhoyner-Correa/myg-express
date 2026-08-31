import { useEffect, useState, type FormEvent } from 'react';
import { Check, FileText, ShieldCheck, Trash2, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { rrhhService } from '../rrhh.service';
import type { AttendanceJustificationRequest, PermissionRequest, VacationRequest } from '../types';
import styles from './AbsenceForms.module.css';

type Target =
  | { kind: 'PERMISO'; item: PermissionRequest }
  | { kind: 'VACACIONES'; item: VacationRequest }
  | { kind: 'JUSTIFICACION'; item: AttendanceJustificationRequest };
type Decision = 'APPROVE' | 'REJECT' | 'CANCEL';
type Props = { siteId: number; target: Target | null; decision: Decision; onClose: () => void; onSaved: () => Promise<void> };

function requestedPeriod(target: Target | null) {
  if (!target) return '';
  if (target.kind === 'JUSTIFICACION') {
    return new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(`${target.item.fecha_incidencia.slice(0, 10)}T12:00:00-05:00`));
  }
  const format = (value: string) => new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima', day: '2-digit', month: 'short',
    year: target.kind === 'VACACIONES' ? 'numeric' : undefined,
    ...(target.kind === 'PERMISO' ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(target.kind === 'PERMISO' ? value : `${value.slice(0, 10)}T12:00:00-05:00`));
  return `${format(target.item.fecha_inicio)} — ${format(target.item.fecha_fin)}`;
}

export function RequestResolutionModal({ siteId, target, decision, onClose, onSaved }: Props) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setComment(''); setError(null); }, [target, decision]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!target) return;
    const requiresResolution = decision !== 'APPROVE' || target.kind === 'JUSTIFICACION';
    if (requiresResolution && comment.trim().length < 5) {
      setError(target.kind === 'JUSTIFICACION'
        ? 'Registra el sustento de la decisión con al menos 5 caracteres.'
        : `Indica un motivo de ${decision === 'CANCEL' ? 'cancelación' : 'rechazo'} de al menos 5 caracteres.`);
      return;
    }
    setSaving(true); setError(null);
    try {
      if (decision === 'CANCEL') {
        if (target.kind === 'PERMISO') await rrhhService.cancelPermission(target.item.id, { sede_id: siteId, reason: comment.trim() });
        else if (target.kind === 'VACACIONES') await rrhhService.cancelVacation(target.item.id, { sede_id: siteId, reason: comment.trim() });
        else throw new Error('Una justificación se cancela desde la cuenta del colaborador.');
      } else if (target.kind === 'PERMISO') {
        await rrhhService.resolvePermission(target.item.id, { sede_id: siteId, decision: decision === 'APPROVE' ? 'APROBADO' : 'RECHAZADO', comment: comment.trim() });
      } else if (target.kind === 'JUSTIFICACION') {
        await rrhhService.resolveAttendanceJustification(target.item.id, {
          sede_id: siteId,
          decision: decision === 'APPROVE' ? 'APROBADA' : 'RECHAZADA',
          comment: comment.trim(),
        });
      } else {
        await rrhhService.resolveVacation(target.item.id, { sede_id: siteId, decision: decision === 'APPROVE' ? 'APROBADA' : 'RECHAZADA', comment: comment.trim() });
      }
      await onSaved(); onClose();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'No se pudo resolver la solicitud.'); }
    finally { setSaving(false); }
  };
  const employee = target?.item;
  const approving = decision === 'APPROVE';
  const cancelling = decision === 'CANCEL';
  const justificationDecision = target?.kind === 'JUSTIFICACION';
  const title = approving ? 'Aprobar solicitud' : cancelling ? 'Cancelar solicitud' : 'Rechazar solicitud';
  const actionLabel = approving ? 'Confirmar aprobación' : cancelling ? 'Confirmar cancelación' : 'Confirmar rechazo';
  const actionIcon = approving ? <Check size={15} /> : cancelling ? <Trash2 size={15} /> : <X size={15} />;
  return <Modal open={Boolean(target)} onClose={onClose} title={title} description="Decisión administrativa auditable" maxWidth={580}
    footer={<><Button variant="secondary" onClick={onClose}>Volver</Button><Button variant={approving ? 'primary' : 'danger'} type="submit" form="resolve-request" loading={saving} icon={actionIcon}>{actionLabel}</Button></>}>
    <form id="resolve-request" className={styles.form} onSubmit={submit}>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={`${styles.decisionHero} ${approving ? styles.approvalHero : styles.rejectionHero}`}><span>{approving ? <Check /> : cancelling ? <Trash2 /> : <X />}</span><div><small>{target?.kind === 'PERMISO' ? 'PERMISO' : target?.kind === 'JUSTIFICACION' ? 'JUSTIFICACIÓN DE ASISTENCIA' : 'VACACIONES'}</small><strong>{employee?.nombres} {employee?.apellidos}</strong><p>{requestedPeriod(target)}</p></div></div>
      <section className={styles.section}>
        <header><FileText /><div><h3>{cancelling ? 'Motivo del retiro' : 'Comentario de resolución'}</h3><p>{approving ? 'Agrega una observación si corresponde.' : cancelling ? 'Explica por qué la solicitud dejará de aplicarse.' : 'Explica claramente el motivo del rechazo.'}</p></div></header>
        <label className={styles.full}><span>{approving && !justificationDecision ? 'Comentario opcional' : 'Sustento de la decisión (obligatorio)'}</span><textarea rows={4} maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={approving && justificationDecision ? 'Ej.: Evidencia verificada y motivo consistente con la incidencia...' : approving ? 'Observación administrativa...' : cancelling ? 'Motivo verificable de la cancelación...' : 'Motivo verificable del rechazo...'} /><small>{comment.length}/500</small></label>
      </section>
      <div className={styles.auditNote}><ShieldCheck /><span>{cancelling ? 'La solicitud dejará de aplicarse, pero permanecerá disponible en auditoría.' : 'La decisión conservará usuario, fecha y comentario en auditoría.'}</span></div>
    </form>
  </Modal>;
}
