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

    const legacyToast = document.getElementById(elementId);
    
    // Use dynamic stack if legacy element is not found, or is the default 'toast' container
    if (!legacyToast || elementId === 'toast') {
      let container = document.getElementById('sui-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'sui-toast-container';
        container.className = 'sui-toast-container';
        document.body.appendChild(container);
      }

      const successSvg = successIcon || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      const errorSvg = errorIcon || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
      const infoSvg = infoIcon || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>';
      const warningSvg = warningIcon || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';

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
          <div class="sui-toast-title">${escapeHtml(toneTitle)}</div>
          <div class="sui-toast-message">${escapeHtml(message)}</div>
        </div>
        <button class="sui-toast-close" type="button" aria-label="Cerrar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
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

      toastCard.querySelector('.sui-toast-close').addEventListener('click', dismiss);
      setTimeout(dismiss, durationMs);
      return;
    }

    // Legacy fallback (in case they have a custom element that behaves differently)
    const hasVisualToast = legacyToast.classList.contains('toast') || legacyToast.className.includes('toast');
    if (!hasVisualToast) {
      legacyToast.textContent = message;
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

    if (legacyToast.querySelector('.toast-content') || legacyToast.querySelector('.toast-icon')) {
      legacyToast.className = `toast toast-${type} show`;
      legacyToast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-copy">
          <div class="toast-title">${escapeHtml(toneTitle)}</div>
          <div class="toast-content">${escapeHtml(message)}</div>
        </div>
        <div class="toast-progress"></div>
      `;
    } else {
      legacyToast.className = `toast show ${type}`;
      legacyToast.textContent = message;
    }

    clearTimeout(global.__sharedToastTimer__);
    global.__sharedToastTimer__ = setTimeout(() => {
      legacyToast.classList.remove('show');
      if (!legacyToast.querySelector('.toast-content')) {
        legacyToast.className = 'toast';
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

  function confirm({ title, message, confirmText = 'Aceptar', cancelText = 'Cancelar', type = 'warning' } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sui-confirm-overlay';
      
      const iconSvg = type === 'danger'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
        : type === 'success'
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
          : type === 'info'
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';

      overlay.innerHTML = `
        <div class="sui-confirm-dialog">
          <div class="sui-confirm-icon ${type}">
            ${iconSvg}
          </div>
          <div class="sui-confirm-title">${escapeHtml(title)}</div>
          <div class="sui-confirm-message">${escapeHtml(message || '')}</div>
          <div class="sui-confirm-actions">
            <button type="button" class="sui-btn sui-btn-secondary btn-cancel">${escapeHtml(cancelText)}</button>
            <button type="button" class="sui-btn ${type === 'danger' ? 'sui-btn-danger' : 'sui-btn-primary'} btn-ok">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      
      // Force reflow
      overlay.offsetHeight;
      overlay.classList.add('open');

      const btnOk = overlay.querySelector('.btn-ok');
      const btnCancel = overlay.querySelector('.btn-cancel');

      const closeDialog = (value) => {
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
  }

  function alert({ title = 'Aviso', message, buttonText = 'Entendido', type = 'info' } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sui-confirm-overlay';
      
      const iconSvg = type === 'success'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
        : type === 'error' || type === 'danger'
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

      overlay.innerHTML = `
        <div class="sui-confirm-dialog">
          <div class="sui-confirm-icon ${type === 'error' ? 'danger' : type}">
            ${iconSvg}
          </div>
          <div class="sui-confirm-title">${escapeHtml(title)}</div>
          <div class="sui-confirm-message">${escapeHtml(message || '')}</div>
          <div class="sui-confirm-actions">
            <button type="button" class="sui-btn sui-btn-primary btn-ok">${escapeHtml(buttonText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      
      overlay.offsetHeight;
      overlay.classList.add('open');

      const btnOk = overlay.querySelector('.btn-ok');

      const closeDialog = () => {
        overlay.classList.remove('open');
        setTimeout(() => {
          overlay.remove();
          resolve();
        }, 200);
      };

      btnOk.addEventListener('click', () => closeDialog());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          closeDialog();
        }
      });
    });
  }

  global.SharedUI = {
    escapeHtml,
    setText,
    setButtonLoading,
    showToast,
    createModalController,
    confirm,
    alert
  };
})(window);

/* ─── Topbar current date ─── */
(function () {
  var el = document.getElementById('current-date');
  if (!el) return;
  var d = new Date();
  var months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var days = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  el.textContent = days[d.getDay()] + ', ' + d.getDate() + ' de ' + months[d.getMonth()] + ' de ' + d.getFullYear();
})();
