import type { ReactNode } from 'react';
import {
  Ban,
  CheckCircle2,
  FileImage,
  FileText,
  MessageSquareText,
  Pause,
  Play,
  Radio,
  Send,
} from 'lucide-react';
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
      <Button icon={<Pause size={15} />} loading={loading} onClick={() => void runAction('pausar')}>
        Pausar envío
      </Button>
      <Button
        className={styles.dangerAction}
        icon={<Ban size={15} />}
        variant="danger"
        loading={loading}
        onClick={() => void runAction('cancelar')}
      >
        Cancelar pendientes
      </Button>
    </>
  ) : (
    <>
      <Button
        icon={<Play size={15} />}
        loading={loading}
        disabled={session?.estado_real !== 'connected'}
        onClick={() => void runAction('reanudar')}
      >
        Retomar envío
      </Button>
      <Button
        icon={<CheckCircle2 size={15} />}
        variant="secondary"
        loading={loading}
        onClick={() => void runAction('manual')}
      >
        Cierre manual
      </Button>
      <Button
        className={styles.dangerAction}
        icon={<Ban size={15} />}
        variant="danger"
        loading={loading}
        onClick={() => void runAction('cancelar')}
      >
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
              <small>Destinatarios pendientes por enviar</small>
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
      </Modal>

      <Modal
        open={controlOpen && Boolean(queue)}
        title={queue?.isProcessing ? 'Control de envío' : 'Ruta pausada'}
        description={queue?.isProcessing
          ? 'Supervisa el envío actual y decide si necesitas detenerlo.'
          : 'Esta ruta requiere una decisión antes de continuar.'}
        onClose={onCloseControl}
        maxWidth={580}
        className={styles.controlDialog}
        footer={controlFooter}
      >
        <div className={`${styles.status} ${queue?.isProcessing ? styles.processing : ''}`}>
          <span className={styles.statusIcon}>
            {queue?.isProcessing ? <Radio aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </span>
          <div>
            <span className={styles.kicker}>{queue?.isProcessing ? 'Envío activo' : 'Decisión requerida'}</span>
            <h3>{queue?.isProcessing ? 'Mensajes en proceso' : 'El envío está detenido'}</h3>
            <p>
              {queue?.isProcessing
                ? 'Puedes pausar los mensajes pendientes sin perder el avance registrado.'
                : queue?.lastError
                  ? 'El envío se detuvo antes de completar todos los mensajes. Elige cómo deseas continuar.'
                  : 'No se enviarán más mensajes hasta que elijas cómo continuar.'}
            </p>
          </div>
        </div>
        <div className={styles.stats}>
          <span><strong>{queued}</strong><small>{queue?.isProcessing ? 'por enviar' : 'en pausa'}</small></span>
          <span><strong>{pending}</strong><small>pendientes</small></span>
          <span>
            <strong>{session?.estado_real === 'connected' ? 'Disponible' : 'Sin conexión'}</strong>
            <small>sesión</small>
          </span>
        </div>
      </Modal>
    </>
  );
}
