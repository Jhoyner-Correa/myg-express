export const showToast = (
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info',
  options: { title?: string; durationMs?: number } = {}
) => {
  const { title, durationMs = 4000 } = options;

  let container = document.getElementById('sui-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sui-toast-container';
    container.className = 'sui-toast-container';
    document.body.appendChild(container);
  }

  const successSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  const errorSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
  const infoSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>';
  const warningSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';

  const toneTitle = title || (
    type === 'success' ? 'Operación completada'
      : type === 'error' ? 'No se pudo completar'
        : type === 'warning' ? 'Revisa esto'
          : 'Información'
  );

  const icon = type === 'success'
    ? successSvg
    : type === 'error'
      ? errorSvg
      : type === 'warning'
        ? warningSvg
        : infoSvg;

  const toastCard = document.createElement('div');
  toastCard.className = `sui-toast sui-toast-${type}`;
  toastCard.innerHTML = `
    <div class="sui-toast-icon">${icon}</div>
    <div class="sui-toast-content">
      <div class="sui-toast-title">${toneTitle}</div>
      <div class="sui-toast-message">${message}</div>
    </div>
    <button class="sui-toast-close" type="button" aria-label="Cerrar">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
    <div class="sui-toast-progress" style="animation-duration: ${durationMs}ms"></div>
  `;

  container.appendChild(toastCard);

  // Trigger transition
  setTimeout(() => toastCard.classList.add('show'), 15);

  const dismiss = () => {
    toastCard.classList.remove('show');
    toastCard.classList.add('hide');
    setTimeout(() => toastCard.remove(), 300);
  };

  const closeBtn = toastCard.querySelector('.sui-toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', dismiss);
  }

  setTimeout(dismiss, durationMs);
};

export const showConfirm = (options: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'success' | 'info';
}): Promise<boolean> => {
  const { title, message, confirmText = 'Aceptar', cancelText = 'Cancelar', type = 'warning' } = options;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sui-confirm-overlay';

    const iconSvg = type === 'danger'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
      : type === 'success'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : type === 'info'
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';

    overlay.innerHTML = `
      <div class="sui-confirm-dialog">
        <div class="sui-confirm-icon ${type}">
          ${iconSvg}
        </div>
        <div class="sui-confirm-title">${title}</div>
        <div class="sui-confirm-message">${message}</div>
        <div class="sui-confirm-actions">
          <button type="button" class="sui-btn sui-btn-secondary btn-cancel">${cancelText}</button>
          <button type="button" class="sui-btn ${type === 'danger' ? 'sui-btn-danger' : 'sui-btn-primary'} btn-ok">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Force reflow
    void overlay.offsetHeight;
    overlay.classList.add('open');

    const btnOk = overlay.querySelector('.btn-ok') as HTMLButtonElement;
    const btnCancel = overlay.querySelector('.btn-cancel') as HTMLButtonElement;

    const closeDialog = (value: boolean) => {
      overlay.classList.remove('open');
      setTimeout(() => {
        overlay.remove();
        resolve(value);
      }, 200);
    };

    btnOk.addEventListener('click', () => closeDialog(true));
    btnCancel.addEventListener('click', () => closeDialog(false));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDialog(false);
      }
    });
  });
};
