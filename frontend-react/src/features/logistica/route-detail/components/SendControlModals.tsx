import type { ReactNode } from 'react';
import { AlertTriangle, FileImage, FileText, Info, MessageSquareText, Radio, Send } from 'lucide-react';
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

function SummaryRow({
  icon,
  label,
  value,
  missing = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  missing?: boolean;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowIcon}>{icon}</span>
      <span className={styles.rowCopy}>
        <span>{label}</span>
        <strong className={missing ? styles.missing : ''}>{value}</strong>
      </span>
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
  const canStart = pending > 0 && Boolean(session) && Boolean(template);

  return (
    <>
      <Modal
        open={confirmOpen}
        title="Confirmar envío de la ruta"
        description="Revisa el resumen antes de iniciar el envío por WhatsApp."
        onClose={onCloseConfirm}
        maxWidth={580}
        className={styles.confirmDialog}
        footer={
          <>
            <Button variant="secondary" onClick={onCloseConfirm}>Cancelar</Button>
            <Button
              icon={<Send size={15} />}
              loading={loading}
              disabled={!canStart}
              onClick={onStart}
            >
              Iniciar envío
            </Button>
          </>
        }
      >
        <div className={styles.summary}>
          <div className={styles.pendingCard}>
            <span className={styles.pendingIcon}><MessageSquareText aria-hidden="true" /></span>
            <span className={styles.pendingCopy}>
              <span>Mensajes pendientes</span>
              <small>Destinatarios listos para entrar a la cola</small>
            </span>
            <strong>{pending}</strong>
          </div>

          <div className={styles.details}>
            <SummaryRow
              icon={<Radio aria-hidden="true" />}
              label="Sesión seleccionada"
              value={session?.nombre || 'Sin seleccionar'}
              missing={!session}
            />
            <SummaryRow
              icon={<FileText aria-hidden="true" />}
              label="Plantilla activa"
              value={template?.nombre || 'Sin seleccionar'}
              missing={!template}
            />
            <SummaryRow
              icon={<FileImage aria-hidden="true" />}
              label="Imagen adjunta"
              value={template?.adjunto_url ? 'Incluida en la plantilla' : 'Sin imagen'}
            />
          </div>
        </div>
        <div className={styles.note}>
          <Info aria-hidden="true" />
          <div>
            <strong>Envío gestionado por cola</strong>
            <p>
              Solo se encolarán destinatarios pendientes. El worker de WhatsApp procesará
              cada mensaje y actualizará los resultados dentro de la ruta.
            </p>
          </div>
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
