const WHATSAPP_POLL_MS = 15000;
const WHATSAPP_QR_POLL_MS = 5000;
const QR_VISIBLE_SECONDS = 60;

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof API !== 'undefined') {
    API.Auth?.requireAuth?.();
    API.ensureSuperadminSidebar?.();
  }

  const user = typeof API !== 'undefined' ? API.getUser?.() : null;
  const state = {
    sesiones: [],
    openQr: new Set(),
    qrCache: new Map(),
    qrFetches: new Set(),
    qrTimers: new Map(),
    mainTimer: null,
    qrPollTimer: null,
    loading: false,
    syncAt: null
  };

  const dom = {
    grid: document.getElementById('sessions-grid'),
    empty: document.getElementById('empty-state'),
    userRole: document.getElementById('user-rol'),


    overlay: document.getElementById('overlay-session'),
    modalTitle: document.getElementById('m-title'),
    modalSub: document.getElementById('m-sub'),
    modalFeedback: document.getElementById('m-feedback'),
    deviceInput: document.getElementById('m-device'),
    saveBtn: document.getElementById('btn-save-m')
  };

  setUserRole(user);
  bindModalEvents();
  bindSessionActions();
  await loadSessions();
  startPolling();

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadSessions(true);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dom.overlay?.classList.contains('open')) {
      closeModal();
    }
  });

  window.addEventListener('beforeunload', cleanup);

  function setUserRole(currentUser) {
    if (!dom.userRole) return;
    dom.userRole.textContent = currentUser?.rol_label || currentUser?.rol || 'Encargado de Oficina';
  }

  async function loadSessions(silent = false) {
    if (state.loading) return;
    state.loading = true;

    if (!silent) {
      renderSkeleton();
    }

    try {
      const response = await API.WhatsAppSesiones?.listar?.();
      state.sesiones = normalizeSessions(response?.data || []);
      state.syncAt = new Date();
      renderPage();
    } catch (error) {
      if (!silent) {
        renderUnavailable(error);
      }
    } finally {
      state.loading = false;
    }
  }

  function normalizeSessions(rows) {
    return rows.map(session => ({
      ...session,
      estado_real: String(session.estado_real || session.estado || 'disconnected').toLowerCase()
    }));
  }

  function startPolling() {
    clearInterval(state.mainTimer);
    state.mainTimer = setInterval(() => {
      if (!document.hidden) loadSessions(true);
    }, WHATSAPP_POLL_MS);
    syncQrPolling();
  }

  function syncQrPolling() {
    clearInterval(state.qrPollTimer);
    state.qrPollTimer = null;

    if (!state.openQr.size) return;

    state.qrPollTimer = setInterval(() => {
      if (!document.hidden) loadSessions(true);
    }, WHATSAPP_QR_POLL_MS);
  }

  function cleanup() {
    clearInterval(state.mainTimer);
    clearInterval(state.qrPollTimer);
    state.qrTimers.forEach(timer => clearInterval(timer));
    state.qrTimers.clear();
  }

  function renderPage() {
    const primary = state.sesiones[0] || null;

    updateModalCopy();

    if (!dom.grid || !dom.empty) return;

    if (!primary) {
      dom.grid.innerHTML = '';
      renderEmpty({
        title: 'Sin dispositivo configurado',
        text: 'Conecta un dispositivo WhatsApp para habilitar el canal de mensajeria de esta sede.',
        variant: 'setup'
      });
      return;
    }

    dom.empty.style.display = 'none';
    dom.grid.innerHTML = renderSessionCard(primary);
    restoreOpenQrPanels();
  }

  function renderSkeleton() {
    if (!dom.grid) return;
    dom.grid.innerHTML = `
      <div class="wa-sk-card">
        <div class="wa-sk wa-sk-h"></div>
        <div class="wa-sk wa-sk-t"></div>
        <div class="wa-sk wa-sk-l"></div>
        <div class="wa-sk wa-sk-l s"></div>
        <div class="wa-sk wa-sk-l"></div>
        <div class="wa-sk wa-sk-l s"></div>
      </div>`;
    if (dom.empty) dom.empty.style.display = 'none';
  }

  function renderUnavailable(error) {
    const message = error?.serviceUnavailable
      ? 'El servicio de mensajería está temporalmente fuera de línea. El resto del sistema continúa operando con normalidad.'
      : error?.message || 'No se pudieron cargar los datos del dispositivo.';

    state.sesiones = [];

    if (dom.grid) dom.grid.innerHTML = '';
    renderEmpty({
      title: 'Servicio temporalmente fuera de línea',
      text: message,
      icon: ICONS.offline,
      variant: 'error'
    });

    toast(message, 'error');
  }

  function renderEmpty({ title, text, icon, variant = 'setup' }) {
    if (!dom.empty) return;
    dom.empty.className = `wa-empty is-${variant}`;
    dom.empty.style.display = variant === 'setup' ? 'grid' : 'flex';
    if (variant === 'setup') {
      dom.empty.innerHTML = `
        <div class="wa-empty-hero" aria-hidden="true">
          <span class="wa-empty-orbit orbit-one"></span>
          <span class="wa-empty-orbit orbit-two"></span>
          <span class="wa-empty-orbit-dot dot-one"></span>
          <span class="wa-empty-orbit-dot dot-two"></span>
          <span class="wa-empty-orbit-dot dot-three"></span>
          <img src="/img/whatsapp-hero-3d-crop.png" alt="" loading="eager">
        </div>
        <strong>Sin dispositivo configurado</strong>
        <span>Conecta un dispositivo WhatsApp para habilitar el canal de mensajeria de esta sede.</span>
        <div class="wa-empty-benefits" aria-label="Beneficios del dispositivo WhatsApp">
          <div class="wa-empty-benefit">
            <div class="wa-empty-benefit-icon">${ICONS.shield}</div>
            <b>Conexion segura</b>
            <small>Tus datos y conversaciones siempre protegidos.</small>
          </div>
          <div class="wa-empty-benefit">
            <div class="wa-empty-benefit-icon">${ICONS.clock}</div>
            <b>En tiempo real</b>
            <small>Sincronizacion inmediata de mensajes y estados.</small>
          </div>
          <div class="wa-empty-benefit">
            <div class="wa-empty-benefit-icon">${ICONS.message}</div>
            <b>Comunicacion efectiva</b>
            <small>Envia y recibe mensajes de manera rapida y organizada.</small>
          </div>
        </div>
        <button class="ge-primary-btn wa-empty-btn" type="button" id="btn-open-modal-empty">
          ${ICONS.qr}
          Configurar dispositivo
        </button>
        <button class="wa-empty-help" type="button">Como conectar mi dispositivo</button>`;
      const emptyBtn = document.getElementById('btn-open-modal-empty');
      if (emptyBtn) emptyBtn.addEventListener('click', openModal);
      const helpBtn = dom.empty.querySelector('.wa-empty-help');
      if (helpBtn) {
        helpBtn.addEventListener('click', () => {
          toast('Registra el dispositivo, abre el QR y escanealo desde WhatsApp > Dispositivos vinculados.', 'info');
        });
      }
      return;
    }

    dom.empty.innerHTML = `
      <div class="wa-empty-icon">${icon}</div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
      <button class="ge-primary-btn wa-empty-btn" type="button" id="btn-open-modal-empty">
        <svg viewBox="0 0 24 24" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Configurar dispositivo
      </button>`;
    const emptyBtn = document.getElementById('btn-open-modal-empty');
    if (emptyBtn) emptyBtn.addEventListener('click', openModal);
  }

  function renderSessionCard(session) {
    const status = session.estado_real;
    const connected = isConnected(status);
    const phone = session.numero_whatsapp || 'No registrado';
    const lastConnection = session.ultima_conexion
      ? formatDateTime(session.ultima_conexion)
      : 'Sin registro de conexión';
    const createdAt = session.created_at
      ? formatDateTime(session.created_at)
      : '-';

    return `
      <article class="wa-device-card ${connected ? 'is-connected' : 'is-offline'}" data-id="${session.id}">
        <div class="wa-device-header">
          <div class="wa-device-info-group">
            <div class="wa-device-icon">
              <img src="/img/whatsapp-hero-3d-crop.png" alt="" loading="eager">
            </div>
            <div>
              <div class="wa-device-name">${escapeHtml(session.nombre_dispositivo || 'Dispositivo sin nombre')}</div>
              <div class="wa-device-sub">Dispositivo oficial de la sede</div>
            </div>
          </div>
          <div class="wa-device-status">
            <div class="wa-status-copy">
              <span class="wa-status-badge ${escapeAttr(status)}">
                <span class="wa-status-dot"></span>
                ${connected ? 'Conectado' : 'Desconectado'}
              </span>
              <span class="wa-status-label">Estado del dispositivo</span>
              <span class="wa-status-memory">Memoria en uso: <strong>116 MB</strong></span>
            </div>
            <span class="wa-status-signal" aria-hidden="true">${ICONS.signal}</span>
          </div>
        </div>

        <div class="wa-device-body">
          <div class="wa-device-meta">
            <div class="wa-meta-item">
              <div class="wa-meta-icon">${ICONS.phone}</div>
              <div class="wa-meta-copy">
                <span class="wa-meta-label">Número</span>
                <div class="wa-meta-value">${escapeHtml(phone)}<span class="wa-copy-trigger" data-action="copy" data-phone="${escapeAttr(session.numero_whatsapp || '')}" title="Copiar número">${ICONS.copy}</span></div>
              </div>
            </div>
            <div class="wa-meta-item">
              <div class="wa-meta-icon">${ICONS.clock}</div>
              <div class="wa-meta-copy">
                <span class="wa-meta-label">Última conexión</span>
                <div class="wa-meta-value">${escapeHtml(lastConnection)}</div>
              </div>
            </div>
            <div class="wa-meta-item">
              <div class="wa-meta-icon">${ICONS.calendar}</div>
              <div class="wa-meta-copy">
                <span class="wa-meta-label">Registrado</span>
                <div class="wa-meta-value">${escapeHtml(createdAt)}</div>
              </div>
            </div>
          </div>

          <div id="qr-panel-${session.id}" style="display:none">
            ${renderQrPanel(session)}
          </div>
        </div>

        <div class="wa-device-actions">
          ${renderDeviceActions(session)}
        </div>
      </article>`;
  }

  function renderDeviceActions(session) {
    return `
      <button class="wa-action-btn outline" type="button" data-action="qr" data-id="${session.id}">
        ${ICONS.qr}<span>Abrir QR</span>
      </button>
      <button class="wa-action-btn outline" type="button" data-action="reconnect" data-id="${session.id}">
        ${ICONS.refresh}<span>Reconectar</span>
      </button>
      <button class="wa-action-btn outline" type="button" data-action="change" data-id="${session.id}">
        ${ICONS.switch}<span>Reemplazar dispositivo</span>
      </button>
      <button class="wa-action-btn outline" type="button" data-action="delete" data-id="${session.id}">
        ${ICONS.trash}<span>Eliminar dispositivo</span>
      </button>`;
  }

  function renderQrPanel(session) {
    return `
      <div class="wa-qr-wrap">
        <div class="wa-qr-head">
          <div class="wa-qr-title">${ICONS.qr}Vincular dispositivo</div>
          <button class="wa-qr-close" type="button" data-action="close-qr" data-id="${session.id}" aria-label="Cerrar QR">
            ${ICONS.close}
          </button>
        </div>
        <p class="wa-qr-inst">Abra <strong>WhatsApp</strong> &gt; <strong>Dispositivos vinculados</strong> &gt; <strong>Vincular dispositivo</strong> y escanee el código.</p>
        <div class="wa-qr-status">
          <span class="wa-qr-pill loading" id="qr-pill-${session.id}">Preparando código</span>
          <span class="wa-qr-timer" id="qr-timer-${session.id}">Esperando...</span>
        </div>
        <div class="wa-qr-display" id="qr-display-${session.id}">
          <div class="wa-qr-loading">
            <span class="wa-spin"></span>
            <span>Generando código QR...</span>
            <small>La operación puede tardar unos segundos.</small>
          </div>
        </div>
        <div class="wa-qr-track"><span class="wa-qr-bar" id="qr-bar-${session.id}"></span></div>
        <div class="wa-qr-foot">
          <span class="wa-qr-helper" id="qr-helper-${session.id}">Escaneé el código con la cámara de su celular para vincular el dispositivo.</span>
          <button class="wa-btn-qr-refresh" type="button" data-action="refresh-qr" data-id="${session.id}">
            ${ICONS.refresh}Actualizar
          </button>
        </div>
      </div>`;
  }

  function bindSessionActions() {
    dom.grid?.addEventListener('click', async event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const id = Number(button.dataset.id);

      if (action === 'qr') return openQr(id);
      if (action === 'close-qr') return closeQr(id);
      if (action === 'refresh-qr') return refreshQr(id, button);
      if (action === 'change') return openModal();
      if (action === 'status') return checkStatus(id, button);
      if (action === 'reconnect') return reconnectSession(id, button);
      if (action === 'logout') return logoutSession(id, button);
      if (action === 'delete') return deleteSession(id, button);
      if (action === 'copy') return copyPhone(button);
    });
  }

  async function checkStatus(id, button) {
    setBtnLoading(button, true, 'Verificando...');
    try {
      const response = await API.WhatsAppSesiones?.obtenerStatus?.(id);
      const status = response?.status || response?.estado || 'disconnected';
      await alertBox({
        title: 'Estado del dispositivo',
        message: `Estado actual: ${formatStatus(status)}`,
        type: isConnected(status) ? 'success' : 'info'
      });
      await loadSessions(true);
    } catch (error) {
      toast(error?.message || 'No se pudo verificar el estado del dispositivo.', 'error');
    } finally {
      setBtnLoading(button, false);
    }
  }

  async function reconnectSession(id, button) {
    setBtnLoading(button, true, 'Conectando...');
    try {
      state.openQr.add(id);
      await API.WhatsAppSesiones?.reconectar?.(id);
      toast('Reconexión iniciada. Espere mientras se restablece la conexión.', 'success');
      await loadSessions(true);
      window.setTimeout(() => openQr(id), 1200);
    } catch (error) {
      toast(error?.message || 'No se pudo iniciar la reconexión.', 'error');
    } finally {
      setBtnLoading(button, false);
    }
  }

  async function logoutSession(id, button) {
    const accepted = await confirmBox({
      title: 'Cerrar sesión',
      message: '¿Desea cerrar la sesión de WhatsApp en este dispositivo?',
      confirmText: 'Cerrar sesión',
      cancelText: 'Cancelar',
      type: 'warning'
    });
    if (!accepted) return;

    setBtnLoading(button, true, 'Cerrando...');
    try {
      await API.WhatsAppSesiones?.cerrar?.(id);
      closeQr(id);
      toast('Sesión cerrada correctamente. El dispositivo ya no está vinculado.', 'success');
      await loadSessions(true);
    } catch (error) {
      toast(error?.message || 'No se pudo cerrar la sesión.', 'error');
    } finally {
      setBtnLoading(button, false);
    }
  }

  async function deleteSession(id, button) {
    const session = findSession(id);
    const accepted = await confirmBox({
      title: 'Eliminar dispositivo',
      message: `¿Desea eliminar "${session?.nombre_dispositivo || 'este dispositivo'}"? Se eliminará la sesión local y la instancia remota.`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      type: 'danger'
    });
    if (!accepted) return;

    setBtnLoading(button, true, 'Eliminando...');
    try {
      await API.WhatsAppSesiones?.eliminar?.(id);
      closeQr(id);
      toast('Dispositivo eliminado correctamente.', 'success');
      await loadSessions(true);
    } catch (error) {
      toast(error?.message || 'No se pudo eliminar la sesión.', 'error');
    } finally {
      setBtnLoading(button, false);
    }
  }

  function copyPhone(button) {
    const phone = button?.dataset?.phone;
    if (!phone) return;
    navigator.clipboard.writeText(phone).then(() => {
      toast('Número copiado al portapapeles.', 'success');
    }).catch(() => {
      toast('No se pudo copiar el número.', 'error');
    });
  }

  function bindModalEvents() {
    document.getElementById('btn-close-m')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancel-m')?.addEventListener('click', closeModal);
    dom.saveBtn?.addEventListener('click', saveSession);
    dom.overlay?.addEventListener('click', event => {
      if (event.target === dom.overlay) closeModal();
    });
  }

  function openModal() {
    updateModalCopy();
    setFeedback();
    dom.overlay?.classList.add('open');
    dom.overlay?.setAttribute('aria-hidden', 'false');
    window.setTimeout(() => dom.deviceInput?.focus(), 40);
  }

  function closeModal() {
    dom.overlay?.classList.remove('open');
    dom.overlay?.setAttribute('aria-hidden', 'true');
    if (dom.deviceInput) dom.deviceInput.value = '';
    setFeedback();
  }

  async function saveSession() {
    const nombre = dom.deviceInput?.value.trim() || '';

    if (!nombre) {
      setFeedback('Escribe un nombre para el dispositivo.', 'error');
      return;
    }

    setBtnLoading(dom.saveBtn, true, 'Guardando dispositivo...');
    try {
      const response = await API.WhatsAppSesiones?.crear?.({
        nombre_dispositivo: nombre
      });
      toast(response?.message || 'Dispositivo guardado correctamente.', 'success');
      closeModal();
      await loadSessions(true);
    } catch (error) {
      setFeedback(error?.message || 'No se pudo guardar la sesión.', 'error');
    } finally {
      setBtnLoading(dom.saveBtn, false);
      updateModalCopy();
    }
  }

  function updateModalCopy() {
    const hasSession = state.sesiones.length > 0;

    if (dom.modalTitle) {
      dom.modalTitle.textContent = hasSession ? 'Cambiar dispositivo' : 'Configurar dispositivo';
    }
    if (dom.modalSub) {
      dom.modalSub.textContent = hasSession
        ? 'La sesión actual será reemplazada. Realice este cambio solo cuando no haya envíos en curso.'
        : 'Registre el dispositivo WhatsApp autorizado para esta sede.';
    }
    if (dom.saveBtn && !dom.saveBtn.disabled) {
      dom.saveBtn.textContent = hasSession ? 'Cambiar dispositivo' : 'Guardar dispositivo';
    }


  }

  function setFeedback(message = '', type = 'error') {
    if (!dom.modalFeedback) return;
    dom.modalFeedback.textContent = message;
    dom.modalFeedback.className = 'fb';
    if (message) dom.modalFeedback.classList.add('show', type);
  }

  async function openQr(id) {
    const panel = getQrPanel(id);
    if (!panel) return;

    state.openQr.add(id);
    syncQrPolling();
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const session = findSession(id);
    if (isConnected(session?.estado_real)) {
      renderConnectedQr(id);
      return;
    }

    if (!state.qrCache.has(id)) {
      state.qrCache.set(id, { qr: null, seconds: QR_VISIBLE_SECONDS });
    }

    await renderQr(id);
  }

  async function renderQr(id) {
    const display = document.getElementById(`qr-display-${id}`);
    if (!display || state.qrFetches.has(id)) return;

    const session = findSession(id);
    if (isConnected(session?.estado_real)) {
      renderConnectedQr(id);
      return;
    }

    setQrState(id, {
      pillClass: 'loading',
      pillText: 'Cargando código',
      timerText: 'Generando código...',
      bar: 10
    });
    display.innerHTML = `
      <div class="wa-qr-loading">
        <span class="wa-spin"></span>
        <span>Solicitando código QR...</span>
        <small>La primera carga puede tardar entre 5 y 15 segundos.</small>
      </div>`;

    state.qrFetches.add(id);
    try {
      const response = await API.WhatsAppSesiones?.obtenerQr?.(id);
      const qr = response?.qr;

      if (!qr) {
        setQrState(id, {
          pillClass: 'loading',
          pillText: 'Esperando código',
          timerText: 'Actualice en unos segundos.',
          bar: 25
        });
        display.innerHTML = '<div class="wa-qr-aviso">Código QR no disponible aún.<small>El servidor está preparando la vinculación. Intente nuevamente en unos segundos.</small></div>';
        return;
      }

      state.qrCache.set(id, { qr, seconds: QR_VISIBLE_SECONDS });
      drawQr(id);
      startQrTimer(id);
    } catch (error) {
      setQrState(id, {
        pillClass: 'expired',
        pillText: 'Error al cargar código',
        timerText: 'No se pudo obtener el código.',
        bar: 0
      });
      display.innerHTML = `<div class="wa-qr-aviso">No se pudo obtener el código QR.<small>${escapeHtml(error?.message || 'Intente nuevamente.')}</small></div>`;
    } finally {
      state.qrFetches.delete(id);
    }
  }

  function drawQr(id) {
    const display = document.getElementById(`qr-display-${id}`);
    const cache = state.qrCache.get(id);
    if (!display || !cache?.qr) return;

    setQrState(id, {
      pillClass: 'ready',
        pillText: 'Código listo para escanear',
        timerText: `Código visible por ${cache.seconds}s`,
      helperText: 'Escaneé el código desde WhatsApp para vincular el dispositivo.',
      bar: Math.max(0, (cache.seconds / QR_VISIBLE_SECONDS) * 100)
    });

    const qr = String(cache.qr);
    if (qr.startsWith('data:image') || /^https?:\/\//i.test(qr)) {
      display.innerHTML = `<img src="${escapeAttr(qr)}" class="wa-qr-img" alt="QR WhatsApp">`;
      return;
    }

    const compactQr = qr.replace(/\s+/g, '');
    if (/^(iVBORw0KGgo|\/9j\/|R0lGOD|UklGR)/.test(compactQr)) {
      display.innerHTML = `<img src="data:image/png;base64,${escapeAttr(compactQr)}" class="wa-qr-img" alt="QR WhatsApp">`;
      return;
    }

    if (typeof window.QRCode === 'function') {
      display.innerHTML = '<div class="wa-qr-generated" aria-label="QR WhatsApp"></div>';
      const target = display.querySelector('.wa-qr-generated');
      try {
        new window.QRCode(target, {
          text: qr,
          width: 224,
          height: 224,
          colorDark: '#06140f',
          colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.H
        });
        return;
      } catch (error) {
        console.warn('No se pudo renderizar QR textual:', error);
      }
    }

      display.innerHTML = `
      <div class="wa-qr-aviso">
        El código QR se recibió en formato de texto.
        <small>Configure el proveedor para devolver la imagen en formato base64 o vuelva a generar la sesión.</small>
      </div>`;
  }

  function startQrTimer(id) {
    clearQrTimer(id);

    const tick = () => {
      const panel = getQrPanel(id);
      if (!panel || panel.style.display === 'none') {
        clearQrTimer(id);
        return;
      }

      const session = findSession(id);
      if (isConnected(session?.estado_real)) {
        renderConnectedQr(id);
        return;
      }

      const cache = state.qrCache.get(id);
      if (!cache) return;

      setQrState(id, {
        timerText: cache.seconds > 0 ? `Código visible por ${cache.seconds}s` : 'Código vencido',
        bar: Math.max(0, (cache.seconds / QR_VISIBLE_SECONDS) * 100)
      });

      if (cache.seconds <= 0) {
        setQrState(id, {
          pillClass: 'expired',
          pillText: 'QR expirado',
          helperText: 'Si ya escaneó el código, espere la conexión. De lo contrario, presione Actualizar.'
        });
        clearQrTimer(id);
        return;
      }

      cache.seconds -= 1;
    };

    tick();
    state.qrTimers.set(id, setInterval(tick, 1000));
  }

  async function refreshQr(id, button) {
    clearQrTimer(id);
    state.qrCache.set(id, { qr: null, seconds: QR_VISIBLE_SECONDS });
    setBtnLoading(button, true, 'Actualizando...');
    try {
      await renderQr(id);
    } finally {
      setBtnLoading(button, false);
    }
  }

  function closeQr(id) {
    const panel = getQrPanel(id);
    if (panel) panel.style.display = 'none';
    state.openQr.delete(id);
    state.qrCache.delete(id);
    clearQrTimer(id);
    syncQrPolling();
  }

  function restoreOpenQrPanels() {
    const openIds = Array.from(state.openQr);
    for (const id of openIds) {
      const panel = getQrPanel(id);
      if (!panel) {
        state.openQr.delete(id);
        clearQrTimer(id);
        continue;
      }

      panel.style.display = 'block';
      const session = findSession(id);
      if (isConnected(session?.estado_real)) {
        renderConnectedQr(id);
        continue;
      }

      if (state.qrCache.get(id)?.qr) {
        drawQr(id);
        if (!state.qrTimers.has(id)) startQrTimer(id);
      } else {
        renderQr(id);
      }
    }
    syncQrPolling();
  }

  function renderConnectedQr(id) {
    clearQrTimer(id);
    setQrState(id, {
      pillClass: 'ready',
      pillText: 'Sesión conectada',
      timerText: 'Conexión activa',
        helperText: 'Dispositivo vinculado y listo para enviar mensajes.',
      bar: 100
    });

    const display = document.getElementById(`qr-display-${id}`);
    if (display) {
      display.innerHTML = '<div class="wa-qr-aviso">El dispositivo ya está conectado.<small>No es necesario generar un nuevo código de vinculación.</small></div>';
    }

    const refreshButton = document.querySelector(`[data-action="refresh-qr"][data-id="${id}"]`);
    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.innerHTML = `${ICONS.check}Vinculado`;
    }
  }

  function setQrState(id, options) {
    const pill = document.getElementById(`qr-pill-${id}`);
    const timer = document.getElementById(`qr-timer-${id}`);
    const helper = document.getElementById(`qr-helper-${id}`);
    const bar = document.getElementById(`qr-bar-${id}`);

    if (pill && options.pillClass) pill.className = `wa-qr-pill ${options.pillClass}`;
    if (pill && options.pillText) pill.textContent = options.pillText;
    if (timer && options.timerText) timer.textContent = options.timerText;
    if (helper && options.helperText) helper.textContent = options.helperText;
    if (bar && typeof options.bar === 'number') bar.style.width = `${options.bar}%`;
  }

  function clearQrTimer(id) {
    const timer = state.qrTimers.get(id);
    if (timer) clearInterval(timer);
    state.qrTimers.delete(id);
  }

  function getQrPanel(id) {
    return document.getElementById(`qr-panel-${id}`);
  }

  function findSession(id) {
    return state.sesiones.find(session => Number(session.id) === Number(id)) || null;
  }

  function isConnected(status) {
    return String(status || '').toLowerCase() === 'connected';
  }

  function formatStatus(status) {
    const value = String(status || 'disconnected').toLowerCase();
    const labels = {
      connected: 'Conectado',
      disconnected: 'Desconectado',
      waiting_qr: 'Esperando QR',
      authenticated: 'Autenticado',
      initializing: 'Inicializando',
      reconnecting: 'Reconectando',
      auth_failure: 'Error de autenticación',
      blocked: 'Bloqueado',
      inactive: 'Inactivo'
    };
    return labels[value] || value.replace(/_/g, ' ').replace(/^\w/, char => char.toUpperCase());
  }

  function formatTime(date) {
    if (!date) return '--:--';
    return new Date(date).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(date) {
    if (!date) return 'Sin sincronización';
    return new Date(date).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatDateTime(date) {
    if (!date) return '-';
    return new Date(date).toLocaleString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function setMetric(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? '');
  }

  function escapeHtml(value) {
    if (window.SharedUI?.escapeHtml) return window.SharedUI.escapeHtml(value);
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function toast(message, type = 'info') {
    if (window.SharedUI?.showToast) {
      window.SharedUI.showToast(message, type);
    } else {
      console[type === 'error' ? 'error' : 'log'](message);
    }
  }

  function setBtnLoading(button, loading, label) {
    if (!button) return;
    if (window.SharedUI?.setButtonLoading) {
      window.SharedUI.setButtonLoading(button, loading, label);
      return;
    }
    button.disabled = loading;
    if (loading && label) button.textContent = label;
  }

  async function confirmBox(options) {
    if (window.SharedUI?.confirm) return window.SharedUI.confirm(options);
    return window.confirm(options.message);
  }

  async function alertBox(options) {
    if (window.SharedUI?.alert) return window.SharedUI.alert(options);
    window.alert(options.message);
  }
});

const ICONS = {
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.52 3.48A11.85 11.85 0 0 0 12.05 0C5.52 0 .2 5.31.2 11.85c0 2.09.54 4.13 1.57 5.93L0 24l6.39-1.68a11.8 11.8 0 0 0 5.66 1.44h.01c6.53 0 11.85-5.31 11.85-11.85 0-3.17-1.24-6.14-3.39-8.43zM12.06 21.7h-.01a9.8 9.8 0 0 1-4.99-1.36l-.36-.21-3.79 1 1.01-3.69-.23-.38a9.8 9.8 0 0 1-1.5-5.21c0-5.43 4.42-9.85 9.86-9.85 2.63 0 5.09 1.02 6.95 2.89a9.79 9.79 0 0 1 2.89 6.96c0 5.43-4.42 9.85-9.84 9.85zm5.4-7.36c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15s-.77.97-.95 1.17c-.17.2-.35.22-.65.07-.3-.15-1.28-.47-2.43-1.49-.9-.8-1.51-1.79-1.68-2.09-.18-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.21 5.1 4.5.71.31 1.27.49 1.71.63.72.23 1.37.2 1.88.12.57-.09 1.77-.72 2.02-1.41.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  message: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  switch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>',
  chevronDown: '<svg class="wa-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  copy: '<svg class="wa-copy-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  signal: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M1 9.1 3.15 11.25c4.9-4.9 12.8-4.9 17.7 0L23 9.1C16.93 3.03 7.08 3.03 1 9.1Z"/><path d="m5.28 13.38 2.15 2.15a6.45 6.45 0 0 1 9.14 0l2.15-2.15c-3.7-3.7-9.74-3.7-13.44 0Z"/><path d="M9.55 17.65 12 20.1l2.45-2.45a3.46 3.46 0 0 0-4.9 0Z"/></svg>',
  offline: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.75V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.25A7 7 0 0 0 12 2z"/><path d="M5 5l14 14"/></svg>'
};
