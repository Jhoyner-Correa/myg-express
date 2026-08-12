import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dismissToast,
  getNotificationsSnapshot,
  resolveConfirmation,
  showConfirm,
  showToast,
} from '../../../core/utils/toast';
import { NotificationHost } from './NotificationHost';

afterEach(() => {
  getNotificationsSnapshot().toasts.forEach(toast => dismissToast(toast.id));
  getNotificationsSnapshot().confirmations.forEach(request => resolveConfirmation(request.id, false));
});

describe('NotificationHost', () => {
  it('renderiza mensajes no confiables como texto y no como HTML', () => {
    showToast('<img src=x onerror=alert(1)>', 'error', { title: '<script>unsafe</script>' });
    render(<NotificationHost />);

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('<script>unsafe</script>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('resuelve confirmaciones mediante un diálogo accesible', async () => {
    const result = showConfirm({
      title: 'Eliminar ruta',
      message: 'Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      type: 'danger',
    });
    render(<NotificationHost />);

    expect(screen.getByRole('dialog', { name: 'Eliminar ruta' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await expect(result).resolves.toBe(true);
  });
});
