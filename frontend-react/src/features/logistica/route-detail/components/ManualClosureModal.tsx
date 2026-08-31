import { useEffect, useId, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardCheck, Info } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { Modal } from '../../../../components/ui/Modal/Modal';
import type { ManualClosureInput, ManualClosureMedium } from '../types';
import styles from './ManualClosureModal.module.css';

interface ManualClosureModalProps {
  open: boolean;
  affected: number;
  loading: boolean;
  onClose: () => void;
  onConfirm: (input: ManualClosureInput) => void;
}

export function ManualClosureModal({
  open,
  affected,
  loading,
  onClose,
  onConfirm,
}: ManualClosureModalProps) {
  const formId = useId();
  const [medium, setMedium] = useState<ManualClosureMedium>('whatsapp_manual');
  const [observation, setObservation] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMedium('whatsapp_manual');
    setObservation('');
    setConfirmed(false);
  }, [open]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirmed || affected <= 0 || loading) return;
    onConfirm({ medium, observation });
  };

  const handleClose = () => {
    if (!loading) onClose();
  };

  return (
    <Modal
      open={open}
      title="Registrar cierre manual"
      description="Registra la atención realizada fuera del sistema."
      onClose={handleClose}
      maxWidth={560}
      className={styles.dialog}
      footer={
        <>
          <Button variant="secondary" disabled={loading} onClick={handleClose}>Cancelar</Button>
          <Button
            type="submit"
            form={formId}
            icon={<CheckCircle2 aria-hidden="true" />}
            loading={loading}
            disabled={!confirmed || affected <= 0}
          >
            Confirmar cierre manual
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.summary}>
          <span className={styles.summaryIcon}><ClipboardCheck aria-hidden="true" /></span>
          <div>
            <strong>{affected} {affected === 1 ? 'destinatario' : 'destinatarios'}</strong>
            <p>Se marcarán como gestionados manualmente.</p>
          </div>
        </div>

        <div className={styles.notice}>
          <Info aria-hidden="true" />
          <p>Esta acción no envía mensajes. Úsala únicamente después de haber atendido a los destinatarios por otro medio.</p>
        </div>

        <label className={styles.field}>
          <span>Medio utilizado</span>
          <select value={medium} onChange={event => setMedium(event.target.value as ManualClosureMedium)}>
            <option value="whatsapp_manual">WhatsApp externo o teléfono personal</option>
            <option value="llamada">Llamada telefónica</option>
            <option value="otro">Otro medio</option>
          </select>
        </label>

        <label className={styles.field}>
          <span>Observación <small>Opcional</small></span>
          <textarea
            value={observation}
            maxLength={255}
            rows={3}
            placeholder="Ejemplo: Mensajes enviados desde el teléfono de la oficina."
            onChange={event => setObservation(event.target.value)}
          />
          <small className={styles.counter}>{observation.length}/255</small>
        </label>

        <label className={styles.confirmation}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)}
          />
          <span>Confirmo que estos destinatarios ya fueron atendidos manualmente.</span>
        </label>
      </form>
    </Modal>
  );
}
