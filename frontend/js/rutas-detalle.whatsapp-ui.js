(function initRutasDetalleWhatsAppUiModule(global) {
  global.RutasDetalleWhatsAppUiModule = function createRutasDetalleWhatsAppUiModule({
    state,
    rutaId,
    escapeHtml,
    capitalize,
    normalizeAvisoVisualStatus,
    formatEstadoLabel,
    getSelectedSessionRecord,
    formatSessionStatus,
    reloadInterruptedState,
    onPauseRefresh,
    mostrarToast
  }) {
    const COLORS = ['#3dc97a', '#25a85f', '#1f8a4e', '#3b82f6', '#8b5cf6', '#f59e0b'];
    const CONF_COLORS = ['#3dc97a', '#25a85f', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];

    function toWhatsappUserMessage(error) {
      const raw = String(error || '').trim();
      if (!raw) return null;

      const normalized = raw.toLowerCase();
      if (
        normalized.includes('connection closed') ||
        normalized.includes('stream errored') ||
        normalized.includes('device_removed') ||
        normalized.includes('connection replaced') ||
        normalized.includes('logged out') ||
        normalized.includes('unauthorized') ||
        normalized.includes('not connected') ||
        normalized.includes('disconnected')
      ) {
        return 'La sesión de WhatsApp se desconectó durante el envío. Reconecta o reemplaza el dispositivo y luego retoma la ruta.';
      }

      if (
        normalized.includes('blocked') ||
        normalized.includes('bloque') ||
        normalized.includes('rate limit') ||
        normalized.includes('too many requests') ||
        normalized.includes('status":429') ||
        normalized.includes('status 429')
      ) {
        return 'El envío fue pausado por protección de WhatsApp. Espera unos minutos y retoma la ruta con una sesión estable.';
      }

      if (normalized.includes('{') || normalized.includes('internal server error') || normalized.includes('sendmedia')) {
        return 'El envío fue pausado por una incidencia técnica de WhatsApp. Verifica la sesión y retoma la ruta cuando esté conectada.';
      }

      return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
    }

    function normalizeQueueControl(control) {
      const safe = control || {};
      const routeStatus = String(safe.routeStatus || '').toLowerCase();
      const pendingJobs = Number(safe.pendingJobs || 0);
      const processingJobs = Number(safe.processingJobs || safe.queuedCount || 0);
      const pausedJobs = Number(safe.pausedJobs || 0);
      const failedJobs = Number(safe.failedCount || 0);
      const hasPendingWork = pendingJobs > 0 || processingJobs > 0 || failedJobs > 0;
      const hasInterruptedFlow = hasPendingWork && (Boolean(safe.hasInterruptedFlow) || routeStatus === 'pausado' || pausedJobs > 0);
      const isProcessing = hasPendingWork && (Boolean(safe.isProcessing) || routeStatus === 'procesando' || processingJobs > 0);
      const isPaused = hasPendingWork && (Boolean(safe.isPaused) || routeStatus === 'pausado');
      return {
        totalJobs: Number(safe.totalJobs || 0),
        routeStatus,
        pendingCount: Number(safe.pendingCount || 0),
        queuedCount: Number(safe.queuedCount || processingJobs),
        failedCount: failedJobs,
        pendingJobs,
        processingJobs,
        pausedJobs,
        hasInterruptedFlow,
        isProcessing,
        isPaused,
        canResume: hasPendingWork && (Boolean(safe.canResume) || (isPaused && (pendingJobs > 0 || failedJobs > 0))),
        canPause: Boolean(safe.canPause) || (isProcessing && pendingJobs > 0),
        canCancel: hasPendingWork && (Boolean(safe.canCancel) || pendingJobs > 0 || hasInterruptedFlow),
        lastError: toWhatsappUserMessage(safe.lastError)
      };
    }

    function updatePrimarySendButtonState() {
      const btn = document.getElementById('btn-enviar-lote');
      if (!btn) return;

      const control = state.queueControl || {};
      btn.disabled = false;
      btn.classList.remove('is-paused', 'is-processing');

      if (control.isProcessing || control.canPause) {
        btn.textContent = 'Envio en curso';
        btn.disabled = true;
        btn.classList.add('is-processing');
        return;
      }

      if (control.canResume || control.isPaused || control.hasInterruptedFlow) {
        btn.textContent = 'Retomar envio';
        btn.classList.add('is-paused');
        return;
      }

      btn.textContent = 'Enviar mensajes';
    }

    function renderEnvioInterruptionPanel() {
      const container = document.getElementById('envio-interrupcion');
      if (!container) return;

      const control = state.queueControl;
      updatePrimarySendButtonState();

      const shouldShow = Boolean(control?.isProcessing || control?.canPause || control?.isPaused || control?.hasInterruptedFlow);
      if (!shouldShow) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      const selectedSession = getSelectedSessionRecord();
      const selectedSessionReady = selectedSession && String(selectedSession.estado_real || selectedSession.estado || '').toLowerCase() === 'connected';
      const pendingCount = state.avisos.filter((item) => String(item.estado_aviso || '').toLowerCase() === 'pendiente').length;
      const isProcessing = Boolean(control.isProcessing || control.canPause);
      const detail = control.lastError || (
        isProcessing
          ? 'El envio esta activo. Puedes pausarlo si necesitas detener los pendientes sin perderlos.'
          : 'La ruta quedo pausada para evitar reenvios automaticos. Decide como continuar con los mensajes pendientes.'
      );
      const triggerText = isProcessing ? 'Envio en curso' : 'Ruta pausada';
      const triggerHelp = isProcessing ? 'Gestionar' : 'Revisar decision';
      const modalTitle = isProcessing ? 'Control de envio' : 'Ruta pausada';
      const modalIntro = isProcessing
        ? 'La ruta esta enviando mensajes. Si detectas un problema, puedes pausar el envio y retomarlo despues.'
        : 'Esta ruta requiere una decision antes de continuar. No se reenviara nada automaticamente.';

      const actions = isProcessing
        ? `
            <button type="button" class="btn-primary" id="btn-pausar-interrumpido">Pausar envio</button>
            <button type="button" class="btn-soft btn-danger-soft" id="btn-cancelar-interrumpido">Cancelar pendientes</button>
          `
        : `
            <button type="button" class="btn-primary" id="btn-retomar-interrumpido" ${selectedSessionReady ? '' : 'disabled'}>Retomar envio</button>
            <button type="button" class="btn-soft" id="btn-marcar-manual-interrumpido">Registrar cierre manual</button>
            <button type="button" class="btn-soft btn-danger-soft" id="btn-cancelar-interrumpido">Cancelar pendientes</button>
          `;
      container.innerHTML = `
        <button type="button" class="envio-control-trigger ${isProcessing ? 'is-processing' : 'is-paused'}" id="btn-open-envio-control" aria-haspopup="dialog" aria-controls="envio-control-modal">
          <span class="envio-control-trigger-dot" aria-hidden="true"></span>
          <span>
            <strong>${triggerText}</strong>
            <small>${triggerHelp}</small>
          </span>
        </button>

        <div class="envio-control-modal" id="envio-control-modal" role="dialog" aria-modal="true" aria-labelledby="envio-control-title" aria-hidden="true">
          <div class="envio-control-dialog">
            <button type="button" class="envio-control-close" data-envio-modal-close aria-label="Cerrar panel">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </button>
            <div class="envio-control-head">
              <span class="envio-control-icon ${isProcessing ? 'is-processing' : 'is-paused'}" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12 8v5"></path><path d="M12 16h.01"></path><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path></svg>
              </span>
              <div>
                <p class="envio-control-kicker">${isProcessing ? 'Envio activo' : 'Decision requerida'}</p>
                <h2 id="envio-control-title">${modalTitle}</h2>
                <p>${modalIntro}</p>
              </div>
            </div>
            <div class="envio-control-note">
              ${escapeHtml(detail)}
            </div>
            <div class="envio-control-stats">
              ${isProcessing ? `
                <span><strong>${Number(control.queuedCount || control.processingJobs || 0)}</strong> en cola</span>
                <span><strong>${pendingCount}</strong> pendientes en tabla</span>
                <span><strong>${selectedSessionReady ? 'Lista' : 'Sin conexion'}</strong> sesion</span>
              ` : `
                <span><strong>${Number(control.pausedJobs || 0)}</strong> en pausa</span>
                <span><strong>${pendingCount}</strong> pendientes en tabla</span>
                <span><strong>${selectedSessionReady ? 'Lista' : 'Pendiente'}</strong> sesion</span>
              `}
            </div>
            <div class="envio-control-actions">
              ${actions}
            </div>
          </div>
        </div>
      `;
      container.style.display = 'inline-flex';
    }

    function openEnvioControlModal() {
      const modal = document.getElementById('envio-control-modal');
      if (!modal) return;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('envio-control-modal-open');
    }

    function closeEnvioControlModal() {
      const modal = document.getElementById('envio-control-modal');
      if (!modal) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('envio-control-modal-open');
    }

    async function runInterruptionAction(button, task) {
      state.interruptionActionRunning = true;
      const originalLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span>Procesando...';

      try {
        await task();
        await reloadInterruptedState();
      } catch (error) {
        mostrarToast(error?.message || 'No se pudo completar la accion de la ruta interrumpida.', 'error');
      } finally {
        state.interruptionActionRunning = false;
        button.disabled = false;
        button.innerHTML = originalLabel;
      }
    }

    function bindEnvioInterrumpido() {
      document.getElementById('envio-interrupcion')?.addEventListener('click', async (event) => {
        const clicked = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (!clicked) return;

        if (clicked.closest('#btn-open-envio-control')) {
          openEnvioControlModal();
          return;
        }

        if (clicked.classList.contains('envio-control-modal') || clicked.closest('[data-envio-modal-close]')) {
          closeEnvioControlModal();
          return;
        }

        const target = clicked.closest('button');
        if (!target || state.interruptionActionRunning) return;

        if (target.id === 'btn-retomar-interrumpido') {
          const selectedSession = getSelectedSessionRecord();
          if (!selectedSession) {
            mostrarToast('Selecciona una sesion activa antes de retomar.', 'error');
            return;
          }

          if (String(selectedSession.estado_real || selectedSession.estado || '').toLowerCase() !== 'connected') {
            mostrarToast('La sesion elegida no esta realmente conectada.', 'error');
            return;
          }

          const conf1 = await SharedUI.confirm({ title: 'Retomar envio', message: 'Se retomaran solo los mensajes interrumpidos de esta ruta. Deseas continuar?', confirmText: 'Retomar', cancelText: 'Cancelar', type: 'info' });
          if (!conf1) return;

          await runInterruptionAction(target, async () => {
            const response = await API.WhatsAppEnvio.reanudarLote(Number(rutaId), Number(selectedSession.id));
            setEnvioVisualState('queued', {
              title: 'Lote reanudado',
              message: response?.message || 'Los mensajes interrumpidos volvieron a la cola con la sesion seleccionada.',
              meta: [`${Number(response?.resumed || 0)} mensajes reanudados`, selectedSession.nombre_dispositivo || 'Sesion activa']
            });
            mostrarToast(response?.message || 'Lote reanudado.', 'success');
          });
          return;
        }

        if (target.id === 'btn-pausar-interrumpido') {
          const confPause = await SharedUI.confirm({ title: 'Pausar envio', message: 'Se detendran los mensajes pendientes de esta ruta. El mensaje que ya este saliendo puede completarse, pero no se enviaran los siguientes hasta que retomes.', confirmText: 'Pausar envio', cancelText: 'Volver', type: 'warning' });
          if (!confPause) return;

          await runInterruptionAction(target, async () => {
            const response = await API.WhatsAppEnvio.pausarLote(Number(rutaId));
            state.queueControl = normalizeQueueControl(response?.control || state.queueControl);
            setEnvioVisualState('error', {
              title: 'Envio pausado',
              message: response?.message || 'La ruta quedo pausada. Puedes retomar o cancelar los pendientes cuando lo decidas.',
              meta: [`${Number(response?.paused || 0)} mensajes detenidos`, `${Number(response?.removed_jobs || 0)} jobs limpiados`]
            });
            mostrarToast(response?.message || 'Envio pausado.', 'success');
          });
          return;
        }

        if (target.id === 'btn-marcar-manual-interrumpido') {
          const conf2 = await SharedUI.confirm({ title: 'Registrar cierre manual', message: 'Los pendientes se cerraran como gestion manual de oficina. No se marcaran como enviados por WhatsApp ni se reenviaran desde el sistema.', confirmText: 'Registrar cierre', cancelText: 'Cancelar', type: 'warning' });
          if (!conf2) return;

          await runInterruptionAction(target, async () => {
            const response = await API.WhatsAppEnvio.marcarManual(Number(rutaId));
            setEnvioVisualState('queued', {
              title: 'Cierre manual registrado',
              message: response?.message || 'Los mensajes pendientes quedaron cerrados como gestion manual de oficina.',
              meta: [`${Number(response?.processed || 0)} mensajes cerrados manualmente`]
            });
            mostrarToast(response?.message || 'Cierre manual registrado.', 'success');
          });
          return;
        }

        if (target.id === 'btn-cancelar-interrumpido') {
          const conf3 = await SharedUI.confirm({ title: 'Cancelar pendientes', message: 'Esto cancelara los mensajes pausados y dejara el lote detenido. Esta accion no enviara esos pendientes.', confirmText: 'Cancelar pendientes', cancelText: 'Volver', type: 'danger' });
          if (!conf3) return;

          await runInterruptionAction(target, async () => {
            const response = await API.WhatsAppEnvio.cancelarPendientes(Number(rutaId));
            setEnvioVisualState('error', {
              title: 'Pendientes cancelados',
              message: response?.message || 'Los mensajes pausados fueron cancelados por decision del usuario.',
              meta: [`${Number(response?.canceled || 0)} mensajes cancelados`]
            });
            mostrarToast(response?.message || 'Pendientes cancelados.', 'success');
          });
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeEnvioControlModal();
      });
    }

    function updateSessionSummary(customMessage, customClass) {
      const display = document.getElementById('session-info-display');
      const text = document.getElementById('session-info-text');
      const indicator = document.getElementById('session-indicator');
      const select = document.getElementById('select-sesion');
      if (!display || !text) return;

      if (typeof customMessage === 'string' && customMessage) {
        text.textContent = customMessage;
        if (indicator) indicator.className = 'session-indicator' + (customClass ? ' ' + customClass : '');
        return;
      }

      const selectedId = select?.value;
      if (!selectedId) {
        state.selectedSessionId = null;
        text.textContent = 'Sin sesión disponible';
        if (indicator) indicator.className = 'session-indicator';
        return;
      }

      const sesion = state.sesiones.find((item) => String(item.id) === String(selectedId));
      if (!sesion) {
        state.selectedSessionId = null;
        text.textContent = 'Sesión no encontrada';
        if (indicator) indicator.className = 'session-indicator is-error';
        return;
      }

      state.selectedSessionId = String(selectedId);
      const device = sesion.nombre_dispositivo || 'WhatsApp';
      const number = sesion.numero_whatsapp || '';
      const estado = String(sesion.estado_real || sesion.estado || '').toLowerCase();
      const isActive = estado === 'connected';

      text.textContent = isActive
        ? `${device}${number ? ' · ' + number : ''}`
        : `${device} · ${formatSessionStatus(estado)}`;

      if (indicator) {
        indicator.className = 'session-indicator' +
          (isActive ? ' is-active' : estado === 'auth_failure' ? ' is-error' : ' is-inactive');
      }
    }

    function getHeroStatusClass(status) {
      switch (String(status || '').toLowerCase()) {
        case 'enviado':
        case 'entregado':
        case 'activo':
        case 'completado':
          return 'hero-inline-chip-success';
        case 'pausado':
          return 'hero-inline-chip-warn';
        case 'fallido':
        case 'cancelado':
        case 'error':
        case 'auth_failure':
          return 'hero-inline-chip-neutral';
        case 'pendiente':
        default:
          return 'hero-inline-chip-warn';
      }
    }

    function bindConfirmacionEnvio() {
      const modal = document.getElementById('modal-confirmar-envio');
      const btnCerrar = document.getElementById('btn-cerrar-confirmar-envio');
      const btnCancelar = document.getElementById('btn-cancelar-confirmar-envio');

      const cerrar = (aceptado = false) => {
        modal?.classList.remove('open');
        if (typeof state.resolveConfirmacionEnvio === 'function') {
          state.resolveConfirmacionEnvio(aceptado);
          state.resolveConfirmacionEnvio = null;
        }
      };

      btnCerrar?.addEventListener('click', () => cerrar(false));
      btnCancelar?.addEventListener('click', () => cerrar(false));
      document.getElementById('btn-aceptar-confirmar-envio')?.addEventListener('click', () => cerrar(true));
      modal?.addEventListener('click', (event) => {
        if (event.target === modal) cerrar(false);
      });
    }

    function solicitarConfirmacionEnvio({ pendientes, sesionId, plantillaNombre, imagen }) {
      const modal = document.getElementById('modal-confirmar-envio');
      const sesion = state.sesiones.find((item) => String(item.id) === String(sesionId));

      SharedUI.setText('confirm-envio-pendientes', String(pendientes));
      SharedUI.setText('confirm-envio-sesion', sesion?.nombre_dispositivo || 'Sesion seleccionada');
      SharedUI.setText('confirm-envio-plantilla', plantillaNombre || 'Sin plantilla');
      SharedUI.setText('confirm-envio-imagen', imagen || 'Sin imagen');
      modal?.classList.add('open');

      return new Promise((resolve) => {
        state.resolveConfirmacionEnvio = resolve;
      });
    }

    function setEnvioVisualState(type, { title, message, meta = [] } = {}) {
      const container = document.getElementById('envio-resultado');
      if (!container) return;

      container.innerHTML = '';
      container.style.display = 'none';
    }

    function sortEnvioTimelineItems(items) {
      const order = { sending: 0, pending: 1, fail: 2, sent: 3 };
      return [...items].sort((a, b) => {
        const orderDiff = (order[a.visualStatus] ?? 99) - (order[b.visualStatus] ?? 99);
        if (orderDiff !== 0) return orderDiff;
        return String(a.aviso.nombre || '').localeCompare(String(b.aviso.nombre || ''), 'es');
      });
    }

    function prependEnvioFeedEvent(aviso, status) {
      const event = {
        id: `${aviso.id}-${status}-${Date.now()}`,
        status,
        name: aviso.nombre || aviso.telefono || 'Destinatario',
        subtitle: `${getFeedSubtitle(status)} · ${aviso.codigo_paquete || aviso.telefono || 'Sin codigo'}`,
        time: getCurrentTimeLabel()
      };
      state.envioFeedItems = [event, ...state.envioFeedItems].slice(0, 8);
    }

    function getFeedSubtitle(status) {
      if (status === 'sending') return 'Enviando mensaje';
      if (status === 'sent') return 'Mensaje enviado';
      if (status === 'fail') return 'No se pudo enviar';
      return 'Pendiente en cola';
    }

    function getFeedIcon(status) {
      if (status === 'sending') {
        return '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4 20-7Z"></path></svg>';
      }
      if (status === 'fail') {
        return '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      }
      return '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }

    function getCurrentTimeLabel() {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    function getInitials(value) {
      return String(value || 'MG')
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }

    function renderFeed() {
      const feed = document.getElementById('feed');
      if (!feed) return;

      if (!state.envioFeedItems.length) {
        feed.innerHTML = '<div class="feed-empty">El feed aparecera aqui durante el envio.</div>';
        return;
      }

      feed.innerHTML = state.envioFeedItems.map((item) => `
        <div class="feed-item fi-${item.status} feed-in">
          <div class="fi-icon">${getFeedIcon(item.status)}</div>
          <div><div class="fi-name">${escapeHtml(item.name)}</div><div class="fi-sub">${escapeHtml(item.subtitle)}</div></div>
          <div class="fi-time">${escapeHtml(item.time)}</div>
        </div>
      `).join('');
    }

    function renderQueueSummary() {
      const sending = state.avisos.filter((item) => normalizeAvisoVisualStatus(item.estado_aviso) === 'enviando').length;
      const pending = state.avisos.filter((item) => normalizeAvisoVisualStatus(item.estado_aviso) === 'pendiente').length;
      const sent = state.avisos.filter((item) => normalizeAvisoVisualStatus(item.estado_aviso) === 'enviado').length;
      const remaining = sending + pending;

      const badge = document.getElementById('q-badge');
      if (badge) {
        badge.textContent = remaining > 0 ? `${remaining} en proceso` : state.avisos.length ? '✓ Lote completado' : 'Sin actividad';
      }

      bumpCounter('cnt-p', pending);
      bumpCounter('cnt-s', sending);
      bumpCounter('cnt-e', sent);
    }

    function bumpCounter(id, value) {
      const el = document.getElementById(id);
      if (!el) return;
      const nextValue = String(value);
      if (el.textContent !== nextValue) {
        el.textContent = nextValue;
        el.classList.remove('count-bump');
        void el.offsetWidth;
        el.classList.add('count-bump');
      } else {
        el.textContent = nextValue;
      }
    }

    function applyRowState(aviso, visualStatus, animate = false) {
      const row = document.getElementById(`row-${aviso.id}`);
      const badge = document.getElementById(`badge-${aviso.id}`);
      const prog = document.getElementById(`prog-${aviso.id}`);
      const pfill = document.getElementById(`pfill-${aviso.id}`);
      if (!badge) return;

      badge.className = `estado-badge estado-${visualStatus}`;
      if (animate) {
        badge.classList.remove('badge-pop-in');
        void badge.offsetWidth;
        badge.classList.add('badge-pop-in');
      }
      badge.innerHTML = `<span class="dot dot-${visualStatus}" id="dot-${aviso.id}"></span>${formatEstadoLabel(aviso.estado_aviso)}`;

      if (visualStatus === 'enviando' && prog) {
        prog.style.display = 'block';
        if (pfill) {
          if (animate) {
            pfill.style.transform = 'scaleX(0)';
            void pfill.offsetWidth;
            pfill.style.transition = 'transform 14s linear';
            pfill.style.transform = 'scaleX(1)';
          } else {
            pfill.style.transition = 'none';
            pfill.style.transform = 'scaleX(0.5)';
          }
        }
      } else if (prog) {
        prog.style.display = 'none';
        if (pfill) pfill.style.transform = 'scaleX(0)';
      }

      if (animate && row) {
        row.classList.remove('row-flash');
        void row.offsetWidth;
        row.classList.add('row-flash');
      }
    }

    function spawnParticles(x, y, count = 10) {
      const layer = document.getElementById('ptl');
      if (!layer) return;
      for (let i = 0; i < count; i += 1) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const angle = Math.random() * 360;
        const distance = 40 + Math.random() * 80;
        const rad = angle * Math.PI / 180;
        particle.style.cssText = `left:${x}px;top:${y}px;width:${4 + Math.random() * 6}px;height:${4 + Math.random() * 6}px;background:${COLORS[Math.floor(Math.random() * COLORS.length)]};--tx:${Math.cos(rad) * distance}px;--ty:${Math.sin(rad) * distance}px;--dur:${0.6 + Math.random() * 0.8}s`;
        layer.appendChild(particle);
        setTimeout(() => particle.remove(), 1400);
      }
    }

    function spawnBeam(fromEl, toEl) {
      if (!fromEl || !toEl) return;
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();
      const x1 = fromRect.left + fromRect.width / 2;
      const y1 = fromRect.top + fromRect.height / 2;
      const x2 = toRect.left + toRect.width / 2;
      const y2 = toRect.top + toRect.height / 2;

      const beam = document.createElement('div');
      beam.className = 'send-beam';
      beam.style.cssText = `left:${x1}px;top:${y1}px;--bx:${x2 - x1}px;--by:${y2 - y1}px;--beam-dur:0.85s`;
      beam.innerHTML = '<div class="send-beam-icon"><svg viewBox="0 0 24 24"><path d="M22 2L11 13"/><path d="m22 2-7 20-4-9-9-4 20-7Z"/></svg></div><div class="send-beam-trail"></div>';
      document.body.appendChild(beam);
      setTimeout(() => beam.remove(), 1000);
    }

    function confettiBurst() {
      const layer = document.getElementById('confetti-layer');
      if (!layer) return;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      for (let i = 0; i < 80; i += 1) {
        const conf = document.createElement('div');
        conf.className = 'conf';
        const size = 6 + Math.random() * 8;
        const angle = Math.random() * 360;
        const distance = 80 + Math.random() * 200;
        const rad = angle * Math.PI / 180;
        const shape = Math.random() > 0.5 ? '50%' : '2px';
        conf.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${CONF_COLORS[Math.floor(Math.random() * CONF_COLORS.length)]};border-radius:${shape};--cx:${Math.cos(rad) * distance - size / 2}px;--cy:${Math.sin(rad) * distance - cy * 1.2}px;--cfx:${(Math.random() - 0.5) * 60}px;--cr:${Math.random() * 360}deg;--cd:${1.4 + Math.random() * 0.8}s;--delay:${Math.random() * 0.4}s`;
        layer.appendChild(conf);
        setTimeout(() => conf.remove(), 3000);
      }
    }

    function animateWaBubble(aviso) {
      const bubble = document.getElementById('wa-bubble');
      const empty = document.getElementById('bubble-empty');
      const typing = document.getElementById('wa-typing');
      const status = document.getElementById('wa-contact-status');
      const contactName = document.getElementById('wa-contact-name');

      if (contactName) contactName.textContent = aviso.nombre || aviso.telefono || 'MyG Express';
      if (empty) empty.style.display = 'none';
      if (bubble) bubble.style.display = 'none';
      if (typing) typing.classList.add('vis');
      if (status) status.textContent = 'escribiendo...';

      setTimeout(() => {
        if (typing) typing.classList.remove('vis');
        if (status) status.textContent = 'En sesión elegida';
        if (bubble) {
          bubble.style.display = 'block';
          bubble.style.animation = 'none';
          void bubble.offsetWidth;
          bubble.style.animation = 'msgBubble 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both';
        }
      }, 800);
    }

    function triggerRowAnimation(aviso, previousStatus, visualStatus) {
      applyRowState(aviso, visualStatus, true);
      const rowEl = document.getElementById(`row-${aviso.id}`);

      if (visualStatus === 'enviando' && rowEl) {
        const phoneEl = document.querySelector('.phone-frame') || document.querySelector('.phone-stage');
        if (phoneEl) spawnBeam(rowEl, phoneEl);
      } else if (visualStatus === 'enviado' && previousStatus === 'enviando') {
        if (rowEl) {
          const rect = rowEl.getBoundingClientRect();
          spawnParticles(rect.right - 50, rect.top + rect.height / 2, 8);
        }
        animateWaBubble(aviso);
      }
    }

    function updateEnvioTimeline() {
      const previousSnapshot = state.envioStatusSnapshot;
      const nextSnapshot = new Map();
      let justFinishedAll = true;

      state.avisos.forEach((aviso) => {
        const visualStatus = normalizeAvisoVisualStatus(aviso.estado_aviso);
        nextSnapshot.set(String(aviso.id), visualStatus);

        if (visualStatus === 'pendiente' || visualStatus === 'enviando') {
          justFinishedAll = false;
        }

        if (state.envioTimelineHydrated) {
          const previousStatus = previousSnapshot.get(String(aviso.id));
          if (previousStatus && previousStatus !== visualStatus) {
            triggerRowAnimation(aviso, previousStatus, visualStatus);
            if (visualStatus === 'enviando') prependEnvioFeedEvent(aviso, 'sending');
            if (visualStatus === 'enviado') prependEnvioFeedEvent(aviso, 'sent');
            if (visualStatus === 'fallido') prependEnvioFeedEvent(aviso, 'fail');
          }
        } else {
          applyRowState(aviso, visualStatus, false);
        }
      });

      if (state.envioTimelineHydrated && justFinishedAll && state.avisos.length > 0) {
        const hasDelivered = state.avisos.some((item) => normalizeAvisoVisualStatus(item.estado_aviso) === 'enviado');
        const wasActiveBefore = Array.from(previousSnapshot.values()).some((status) => status === 'pendiente' || status === 'enviando');
        if (hasDelivered && wasActiveBefore) {
          confettiBurst();
          mostrarToast('Lote completado exitosamente', 'success');
        }
      }

      state.envioStatusSnapshot = nextSnapshot;
      state.envioTimelineHydrated = true;
      renderQueueSummary();
      renderFeed();
    }

    return {
      normalizeQueueControl,
      renderEnvioInterruptionPanel,
      updatePrimarySendButtonState,
      bindEnvioInterrumpido,
      updateSessionSummary,
      bindConfirmacionEnvio,
      solicitarConfirmacionEnvio,
      setEnvioVisualState,
      updateEnvioTimeline,
      getHeroStatusClass
    };
  };
})(window);
