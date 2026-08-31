import { useEffect, useSyncExternalStore } from 'react';
import { AlertTriangle, Check, Info, ShieldAlert, X } from 'lucide-react';
import { Button } from '../Button/Button';
import { Modal } from '../Modal/Modal';
import {
  dismissToast,
  getNotificationsSnapshot,
  resolveConfirmation,
  subscribeNotifications,
  type ConfirmationRequest,
  type ToastNotification,
} from '../../../core/utils/toast';
import styles from './NotificationHost.module.css';

const icons = {
  success: Check,
  error: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

export function NotificationHost() {
  const { toasts, confirmations } = useSyncExternalStore(
    subscribeNotifications,
    getNotificationsSnapshot,
    getNotificationsSnapshot,
  );
  const confirmation = confirmations[0];

  return (
    <>
      <div className={styles.viewport} aria-live="polite" aria-atomic="false">
        {toasts.map(toast => <ToastCard key={toast.id} toast={toast} />)}
      </div>
      {confirmation && <ConfirmationDialog request={confirmation} />}
    </>
  );
}

function ToastCard({ toast }: { toast: ToastNotification }) {
  const Icon = icons[toast.tone];

  useEffect(() => {
    const timeout = window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
    return () => window.clearTimeout(timeout);
  }, [toast.durationMs, toast.id]);

  return (
    <article
      className={`${styles.toast} ${styles[toast.tone]}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <span className={styles.icon}><Icon aria-hidden="true" /></span>
      <div className={styles.copy}>
        <strong>{toast.title}</strong>
        <p>{toast.message}</p>
      </div>
      <button
        className={styles.close}
        type="button"
        onClick={() => dismissToast(toast.id)}
        aria-label="Cerrar notificación"
      >
        <X aria-hidden="true" />
      </button>
      <span
        className={styles.progress}
        style={{ animationDuration: `${toast.durationMs}ms` }}
        aria-hidden="true"
      />
    </article>
  );
}

function ConfirmationDialog({ request }: { request: ConfirmationRequest }) {
  const Icon = icons[request.type === 'danger' ? 'error' : request.type];
  const close = (confirmed: boolean) => resolveConfirmation(request.id, confirmed);

  return (
    <Modal
      open
      title={request.title}
      onClose={() => close(false)}
      maxWidth={420}
      className={styles.confirmDialog}
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={() => close(false)}>
            {request.cancelText}
          </Button>
          <Button
            type="button"
            variant={request.type === 'danger' ? 'danger' : 'primary'}
            onClick={() => close(true)}
            autoFocus
          >
            {request.confirmText}
          </Button>
        </>
      )}
    >
      <div className={`${styles.confirmBody} ${styles[request.type]}`}>
        <span className={styles.confirmIcon}><Icon aria-hidden="true" /></span>
        <p>{request.message}</p>
      </div>
    </Modal>
  );
}
