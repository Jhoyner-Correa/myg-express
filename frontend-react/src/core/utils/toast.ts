export type ToastTone = 'success' | 'error' | 'warning' | 'info';
export type ConfirmationTone = 'danger' | 'warning' | 'success' | 'info';

export type ToastOptions = {
  title?: string;
  durationMs?: number;
};

export type ConfirmationOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmationTone;
};

export type ToastNotification = {
  id: number;
  message: string;
  title: string;
  tone: ToastTone;
  durationMs: number;
};

export type ConfirmationRequest = Required<ConfirmationOptions> & {
  id: number;
};

type NotificationSnapshot = {
  toasts: ToastNotification[];
  confirmations: ConfirmationRequest[];
};

type ConfirmationResolver = (confirmed: boolean) => void;

const DEFAULT_TITLES: Record<ToastTone, string> = {
  success: 'Operación completada',
  error: 'No se pudo completar',
  warning: 'Revisa esto',
  info: 'Información',
};

let sequence = 0;
let snapshot: NotificationSnapshot = { toasts: [], confirmations: [] };
const listeners = new Set<() => void>();
const confirmationResolvers = new Map<number, ConfirmationResolver>();

function publish(next: NotificationSnapshot) {
  snapshot = next;
  listeners.forEach(listener => listener());
}

export function subscribeNotifications(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNotificationsSnapshot() {
  return snapshot;
}

export function showToast(
  message: string,
  type: ToastTone = 'info',
  options: ToastOptions = {},
) {
  const notification: ToastNotification = {
    id: ++sequence,
    message,
    tone: type,
    title: options.title || DEFAULT_TITLES[type],
    durationMs: Math.max(1_000, options.durationMs ?? 4_000),
  };

  publish({ ...snapshot, toasts: [...snapshot.toasts, notification] });
  return notification.id;
}

export function dismissToast(id: number) {
  if (!snapshot.toasts.some(toast => toast.id === id)) return;
  publish({ ...snapshot, toasts: snapshot.toasts.filter(toast => toast.id !== id) });
}

export function showConfirm(options: ConfirmationOptions): Promise<boolean> {
  const id = ++sequence;
  const request: ConfirmationRequest = {
    id,
    title: options.title,
    message: options.message,
    confirmText: options.confirmText ?? 'Aceptar',
    cancelText: options.cancelText ?? 'Cancelar',
    type: options.type ?? 'warning',
  };

  return new Promise(resolve => {
    confirmationResolvers.set(id, resolve);
    publish({ ...snapshot, confirmations: [...snapshot.confirmations, request] });
  });
}

export function resolveConfirmation(id: number, confirmed: boolean) {
  const resolve = confirmationResolvers.get(id);
  if (!resolve) return;

  confirmationResolvers.delete(id);
  publish({
    ...snapshot,
    confirmations: snapshot.confirmations.filter(request => request.id !== id),
  });
  resolve(confirmed);
}
