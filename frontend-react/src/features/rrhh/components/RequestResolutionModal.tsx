import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { rrhhService } from '../rrhh.service';
import type { PermissionRequest, VacationRequest } from '../types';
import styles from '../Rrhh.module.css';

type Target = { kind: 'PERMISO'; item: PermissionRequest } | { kind: 'VACACIONES'; item: VacationRequest };
type Props = { siteId: number; target: Target | null; decision: 'APPROVE' | 'REJECT'; onClose: () => void; onSaved: () => Promise<void> };

export function RequestResolutionModal({ siteId, target, decision, onClose, onSaved }: Props) {
  const [comment, setComment] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { setComment(''); setError(null); }, [target, decision]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!target) return;
    if (decision === 'REJECT' && comment.trim().length < 5) { setError('Indica el motivo del rechazo.'); return; }
    setSaving(true); setError(null);
    try {
      if (target.kind === 'PERMISO') await rrhhService.resolvePermission(target.item.id, { sede_id: siteId, decision: decision === 'APPROVE' ? 'APROBADO' : 'RECHAZADO', comment });
      else await rrhhService.resolveVacation(target.item.id, { sede_id: siteId, decision: decision === 'APPROVE' ? 'APROBADA' : 'RECHAZADA', comment });
      await onSaved(); onClose();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'No se pudo resolver la solicitud.'); }
    finally { setSaving(false); }
  };
  const employee = target?.item;
  return <Modal open={Boolean(target)} onClose={onClose} title={decision === 'APPROVE' ? 'Aprobar solicitud' : 'Rechazar solicitud'} description={`${employee?.nombres ?? ''} ${employee?.apellidos ?? ''}`} maxWidth={520}
    footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant={decision === 'REJECT' ? 'danger' : 'primary'} type="submit" form="resolve-request" loading={saving}>{decision === 'APPROVE' ? 'Confirmar aprobación' : 'Confirmar rechazo'}</Button></>}>
    <form id="resolve-request" className={styles.form} onSubmit={submit}>{error && <div className={styles.formError} role="alert">{error}</div>}<div className={styles.resolutionSummary}>La decisión quedará registrada con tu usuario, fecha y comentario en la auditoría de RR. HH.</div><label className={styles.fullField}>Comentario {decision === 'REJECT' ? 'obligatorio' : 'opcional'}<textarea rows={3} maxLength={500} value={comment} onChange={event => setComment(event.target.value)} /></label></form>
  </Modal>;
}
