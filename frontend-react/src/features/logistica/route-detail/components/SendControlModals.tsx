import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { Modal } from '../../../../components/ui/Modal/Modal';
import type { QueueAction, QueueControl, SessionItem, TemplateItem } from '../types';
import styles from './SendControlModals.module.css';

interface SendControlModalsProps {
  confirmOpen: boolean;
  controlOpen: boolean;
  queue: QueueControl | null;
  pending: number;
  session: SessionItem | null;
  template: TemplateItem | null;
  loading: boolean;
  onCloseConfirm: () => void;
  onCloseControl: () => void;
  onStart: () => void;
  onAction: (action: QueueAction) => Promise<boolean>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SendControlModals({
  confirmOpen,
  controlOpen,
  queue,
  pending,
  session,
  template,
  loading,
  onCloseConfirm,
  onCloseControl,
  onStart,
  onAction,
}: SendControlModalsProps) {
  const runAction = async (action: QueueAction) => {
    const succeeded = await onAction(action);
    if (succeeded) onCloseControl();
  };

  const controlFooter = queue?.isProcessing ? (
    <>
      <Button loading={loading} onClick={() => void runAction('pausar')}>
        Pausar envío
      </Button>
      <Button variant="danger" loading={loading} onClick={() => void runAction('cancelar')}>
        Cancelar pendientes
      </Button>
    </>
  ) : (
    <>
      <Button
        loading={loading}
        disabled={session?.estado_real !== 'connected'}
        onClick={() => void runAction('reanudar')}
      >
        Retomar envío
      </Button>
      <Button variant="secondary" loading={loading} onClick={() => void runAction('manual')}>
        Cierre manual
      </Button>
      <Button variant="danger" loading={loading} onClick={() => void runAction('cancelar')}>
        Cancelar pendientes
      </Button>
    </>
  );

  const queued = Number(
    queue?.isProcessing
      ? queue.queuedCount || queue.processingJobs || 0
      : queue?.pausedJobs || 0,
  );

  return (
    <>
      <Modal
        open={confirmOpen}
        title="Confirmar envío de la ruta"
        description="Revisa el resumen antes de iniciar el envío por WhatsApp."
        onClose={onCloseConfirm}
        footer={
          <>
            <Button variant="secondary" onClick={onCloseConfirm}>Cancelar</Button>
            <Button loading={loading} onClick={onStart}>Iniciar envío</Button>
          </>
        }
      >
        <div className={styles.summary}>
          <SummaryRow label="Mensajes pendientes" value={String(pending)} />
          <SummaryRow label="Sesión seleccionada" value={session?.nombre || '-'} />
          <SummaryRow label="Plantilla activa" value={template?.nombre || '-'} />
          <SummaryRow
            label="Imagen adjunta"
            value={template?.adjunto_url ? 'Según plantilla' : 'No contiene'}
          />
        </div>
        <div className={styles.note}>
          Solo se encolarán destinatarios pendientes. El worker actualizará los resultados
          dentro de la ruta.
        </div>
      </Modal>

      <Modal
        open={controlOpen && Boolean(queue)}
        title={queue?.isProcessing ? 'Control de envío' : 'Ruta pausada'}
        onClose={onCloseControl}
        footer={controlFooter}
      >
        <div className={styles.status}>
          <AlertTriangle aria-hidden="true" />
          <div>
            <h3>{queue?.isProcessing ? 'Envío activo' : 'Decisión requerida'}</h3>
            <p>
              {queue?.lastError || (queue?.isProcessing
                ? 'Puedes pausar los pendientes sin perderlos.'
                : 'No se reenviará nada automáticamente hasta que elijas una acción.')}
            </p>
          </div>
        </div>
        <div className={styles.stats}>
          <span><strong>{queued}</strong>{queue?.isProcessing ? 'en cola' : 'en pausa'}</span>
          <span><strong>{pending}</strong>pendientes</span>
          <span>
            <strong>{session?.estado_real === 'connected' ? 'Lista' : 'Sin conexión'}</strong>
            sesión
          </span>
        </div>
      </Modal>
    </>
  );
}
