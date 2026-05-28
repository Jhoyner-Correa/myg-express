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

    function normalizeQueueControl(control) {
      const safe = control || {};
      return {
        pendingJobs: Number(safe.pendingJobs || 0),
        processingJobs: Number(safe.processingJobs || 0),
        pausedJobs: Number(safe.pausedJobs || 0),
        hasInterruptedFlow: Boolean(safe.hasInterruptedFlow) || Number(safe.pausedJobs || 0) > 0,
        lastError: safe.lastError ? String(safe.lastError) : null
      };
    }

    function renderEnvioInterruptionPanel() {
      const container = document.getElementById('envio-interrupcion');
      if (!container) return;

      const control = state.queueControl;
      if (!control?.hasInterruptedFlow || control.pausedJobs <= 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      const selectedSession = getSelectedSessionRecord();
      const selectedSessionReady = selectedSession && String(selectedSession.estado_real || selectedSession.estado || '').toLowerCase() === 'connected';
      const pendingCount = state.avisos.filter((item) => String(item.estado_aviso || '').toLowerCase() === 'pendiente').length;
      const detail = control.lastError || 'La sesion de WhatsApp se interrumpio y la ruta quedo en pausa para evitar reenvios automaticos.';

      container.innerHTML = `
        <div class="envio-pause-card">
          <div class="envio-pause-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 8v5"></path><path d="M12 16h.01"></path><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"></path></svg>
          </div>
          <div class="envio-pause-content">
            <div class="envio-pause-kicker">Envio interrumpido</div>
            <div class="envio-pause-title">Esta ruta quedo pausada y requiere tu decision</div>
            <div class="envio-pause-copy">${escapeHtml(detail)}</div>
            <div class="envio-pause-pills">
              <span class="envio-pause-pill">${control.pausedJobs} en pausa</span>
              <span class="envio-pause-pill">${pendingCount} pendientes en tabla</span>
              <span class="envio-pause-pill">${selectedSessionReady ? 'Sesion lista para retomar' : 'Selecciona una sesion activa arriba'}</span>
            </div>
            <div class="envio-pause-actions">
              <button type="button" class="btn-primary" id="btn-retomar-interrumpido" ${selectedSessionReady ? '' : 'disabled'}>Retomar envio</button>
              <button type="button" class="btn-soft" id="btn-marcar-manual-interrumpido">Marcar como enviados manualmente</button>
              <button type="button" class="btn-soft btn-danger-soft" id="btn-cancelar-interrumpido">Cancelar pendientes</button>
            </div>
          </div>
        </div>
      `;
      container.style.display = 'block';
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
        const target = event.target.closest('button');
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

          if (!window.confirm('Se retomaran solo los mensajes interrumpidos de esta ruta. Deseas continuar?')) return;

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

        if (target.id === 'btn-marcar-manual-interrumpido') {
          if (!window.confirm('Esto marcara los mensajes pausados como enviados manualmente. Usalo solo si ya terminaste esos mensajes desde el celular. Deseas continuar?')) return;

          await runInterruptionAction(target, async () => {
            const response = await API.WhatsAppEnvio.marcarManual(Number(rutaId));
            setEnvioVisualState('queued', {
              title: 'Mensajes cerrados manualmente',
              message: response?.message || 'Los mensajes pausados se marcaron como enviados manualmente.',
              meta: [`${Number(response?.processed || 0)} mensajes cerrados`]
            });
            mostrarToast(response?.message || 'Mensajes marcados manualmente.', 'success');
          });
          return;
        }

        if (target.id === 'btn-cancelar-interrumpido') {
          if (!window.confirm('Esto cancelara los mensajes pausados y dejara el lote detenido. Esta accion no enviara esos pendientes. Deseas continuar?')) return;

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
    }

    function updateSessionSummary(customMessage, customClass) {
      const summary = document.getElementById('session-summary');
      const select = document.getElementById('select-sesion');
      if (!summary) return;

      summary.className = 'session-summary';
      if (typeof customMessage === 'string' && customMessage) {
        summary.textContent = customMessage;
        if (customClass) summary.classList.add(customClass);
        return;
      }

      const selectedId = select?.value;
      if (!selectedId) {
        state.selectedSessionId = null;
        summary.textContent = 'Sin sesion seleccionada';
        return;
      }

      const sesion = state.sesiones.find((item) => String(item.id) === String(selectedId));
      if (!sesion) {
        state.selectedSessionId = null;
        summary.textContent = 'Sesion no encontrada';
        summary.classList.add('is-error');
        return;
      }

      state.selectedSessionId = String(selectedId);
      const device = sesion.nombre_dispositivo || 'Dispositivo';
      const number = sesion.numero_whatsapp ? ` - ${sesion.numero_whatsapp}` : '';
      const estado = String(sesion.estado_real || sesion.estado || '').toLowerCase();
      const isActive = estado === 'connected';

      summary.textContent = isActive
        ? `${device}${number} - Activa`
        : `${device}${number} - ${formatSessionStatus(estado)}`;

      summary.classList.add(isActive ? 'is-active' : estado === 'auth_failure' ? 'is-error' : 'is-inactive');
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

      if (!type) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
      }

      const normalizedType = ['loading', 'queued', 'error'].includes(type) ? type : 'loading';
      const safeMeta = meta.filter(Boolean).map((item) => `<span class="envio-status-pill">${escapeHtml(item)}</span>`).join('');
      const dots = normalizedType === 'loading'
        ? '<span class="envio-status-dots" aria-hidden="true"><span></span><span></span><span></span></span>'
        : '';

      container.innerHTML = `
        <div class="envio-status-card is-${normalizedType}">
          <div class="envio-status-icon" aria-hidden="true">${getEnvioStateIcon(normalizedType)}</div>
          <div class="envio-status-content">
            <div class="envio-status-kicker">${escapeHtml(getEnvioStateKicker(normalizedType))}</div>
            <div class="envio-status-title">${escapeHtml(title || 'Estado del envio')}${dots}</div>
            <div class="envio-status-copy">${escapeHtml(message || '').replace(/\n/g, '<br>')}</div>
            ${safeMeta ? `<div class="envio-status-meta">${safeMeta}</div>` : ''}
            <div class="envio-status-progress"><span></span></div>
          </div>
        </div>
      `;
      container.style.display = 'block';
    }

    function getEnvioStateKicker(type) {
      if (type === 'queued') return 'Envios en proceso';
      if (type === 'error') return 'Atencion requerida';
      return 'Iniciando envio';
    }

    function getEnvioStateIcon(type) {
      if (type === 'queued') {
        return '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"></path></svg>';
      }
      if (type === 'error') {
        return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="7.5" x2="12" y2="12.5"></line><line x1="12" y1="16.5" x2="12.01" y2="16.5"></line></svg>';
      }
      return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" opacity="0.25"></circle><path d="M12 7v5l3 2"></path></svg>';
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
        if (status) status.textContent = 'en linea';
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
        const phoneEl = document.querySelector('.preview-phone-shell');
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
