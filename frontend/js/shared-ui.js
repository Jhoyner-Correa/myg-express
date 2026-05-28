(function initSharedUI(global) {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setText(id, value) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el) el.textContent = String(value);
  }

  function setButtonLoading(target, loading, label) {
    const btn = typeof target === 'string' ? document.getElementById(target) : target;
    if (!btn) return;

    if (!btn.dataset.label) {
      btn.dataset.label = btn.innerHTML;
    }

    btn.disabled = loading;
    btn.innerHTML = loading
      ? `<span class="spinner"></span>${label || 'Procesando...'}`
      : btn.dataset.label;
  }

  function showToast(message, type = 'info', options = {}) {
    const {
      elementId = 'toast',
      durationMs = 4000,
      title,
      successIcon,
      errorIcon,
      infoIcon,
      warningIcon
    } = options;

    const toast = document.getElementById(elementId);
    if (!toast) return;

    const hasVisualToast = toast.classList.contains('toast') || toast.className.includes('toast');
    if (!hasVisualToast) {
      toast.textContent = message;
      return;
    }

    const successSvg = successIcon || '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    const errorSvg = errorIcon || '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    const infoSvg = infoIcon || '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>';
    const warningSvg = warningIcon || '<svg viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
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

    if (toast.querySelector('.toast-content') || toast.querySelector('.toast-icon')) {
      toast.className = `toast toast-${type} show`;
      toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-copy">
          <div class="toast-title">${escapeHtml(toneTitle)}</div>
          <div class="toast-content">${escapeHtml(message)}</div>
        </div>
        <div class="toast-progress"></div>
      `;
    } else {
      toast.className = `toast show ${type}`;
      toast.textContent = message;
    }

    clearTimeout(global.__sharedToastTimer__);
    global.__sharedToastTimer__ = setTimeout(() => {
      toast.classList.remove('show');
      if (!toast.querySelector('.toast-content')) {
        toast.className = 'toast';
      }
    }, durationMs);
  }

  function createModalController({ root, onClose } = {}) {
    const modal = typeof root === 'string' ? document.getElementById(root) : root;

    function setOpen(open) {
      modal?.classList.toggle('open', open);
      if (!open && typeof onClose === 'function') {
        onClose();
      }
    }

    function bindClose(trigger) {
      const el = typeof trigger === 'string' ? document.getElementById(trigger) : trigger;
      el?.addEventListener('click', () => setOpen(false));
    }

    function bindOverlayClose() {
      modal?.addEventListener('click', (event) => {
        if (event.target === modal) {
          setOpen(false);
        }
      });
    }

    return {
      modal,
      open() { setOpen(true); },
      close() { setOpen(false); },
      toggle(open) { setOpen(Boolean(open)); },
      bindClose,
      bindOverlayClose
    };
  }

  global.SharedUI = {
    escapeHtml,
    setText,
    setButtonLoading,
    showToast,
    createModalController
  };
})(window);
