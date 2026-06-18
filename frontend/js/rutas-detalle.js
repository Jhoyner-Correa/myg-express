document.addEventListener('DOMContentLoaded', async () => {
  API.Auth.requireAuth();
  API.ensureSuperadminSidebar();

  const user = API.getUser();
  const rutaId = API.Routes.extractLoteIdFromLocation();
  if (!rutaId) {
    window.location.href = API.Routes.rutas;
    return;
  }

  const state = {
    avisos: [],
    plantillas: [],
    sesiones: [],
    queueControl: null,
    selectedPlantillaId: null,
    defaultPlantillaId: null,
    selectedSessionId: null,
    editingPlantillaId: null,
    templateImageBase64: null,
    templateImageName: null,
    templateImageBorrar: false,
    searchQuery: '',
    statusFilter: 'todos',
    interactionLockUntil: 0,
    interruptionActionRunning: false,
    loadingLote: false,
    loadingAvisos: false,
    loadingSesiones: false,
    envioTimelineHydrated: false,
    envioStatusSnapshot: new Map(),
    envioFeedItems: [],
    lastAvisosSignature: '',
    lastVisibleRowsSignature: '',
    resolveConfirmacionEnvio: null
  };

  const dataModule = window.RutasDetalleDataModule({
    getEmpresaOrigen: () => document.getElementById('hero-origen')?.textContent?.trim() || ''
  });

  const tableModule = window.RutasDetalleTableModule({
    state,
    escapeHtml: SharedUI.escapeHtml,
    formatFechaHora,
    capitalize,
    pauseAutoRefresh,
    onDelete: eliminarDestinatario
  });

  const whatsappUi = window.RutasDetalleWhatsAppUiModule({
    state,
    rutaId,
    escapeHtml: SharedUI.escapeHtml,
    capitalize,
    normalizeAvisoVisualStatus: tableModule.normalizeAvisoVisualStatus,
    formatEstadoLabel: tableModule.formatEstadoLabel,
    getSelectedSessionRecord,
    formatSessionStatus,
    reloadInterruptedState: async () => {
      await cargarLote(true);
      await cargarAvisos(true);
      await cargarSesiones(true);
      void progressPoller.tick?.();
      void sessionPoller.tick?.();
    },
    onPauseRefresh: pauseAutoRefresh,
    mostrarToast
  });

  const templatesModule = window.RutasDetalleTemplatesModule({
    state,
    escapeHtml: SharedUI.escapeHtml,
    mostrarToast,
    setBtnLoading,
    optimizeImage: dataModule.optimizeImage
  });

  const progressPoller = LiveUpdates.createVisibilityAwarePoller({
    intervalMs: 15000,
    runImmediately: false,
    onTick: async () => {
      if (!shouldAutoRefreshLote()) return;
      await refrescarVistaEnVivo();
    }
  });

  const sessionPoller = LiveUpdates.createVisibilityAwarePoller({
    intervalMs: 45000,
    runImmediately: false,
    onTick: async () => {
      await cargarSesiones(true);
    }
  });

  hydrateChrome(user);
  bindImportacion();
  tableModule.bindBusqueda();
  tableModule.bindRowActions();
  tableModule.bindFiltros();
  tableModule.bindExport();
  bindNuevoAviso();
  bindVaciarLote();
  templatesModule.bindPlantillasModal();
  whatsappUi.bindConfirmacionEnvio();
  bindEnvioLote();
  whatsappUi.bindEnvioInterrumpido();

  await cargarLote();
  await cargarAvisos();
  await templatesModule.loadTemplates();
  await cargarSesiones();
  templatesModule.updatePreview();
  progressPoller.start();
  sessionPoller.start();

  function hydrateChrome(currentUser) {
    SharedUI.setText('user-nombre', currentUser?.nombre || 'Usuario');
    SharedUI.setText('user-sede', currentUser?.sede_nombre || '-');
    SharedUI.setText('user-rol', currentUser?.rol || '-');
    SharedUI.setText('user-avatar', (currentUser?.nombre || 'U')[0].toUpperCase());
    const firstHeader = document.querySelector('.table-card thead th:first-child');
    if (firstHeader) firstHeader.textContent = 'Nro.';
    document.getElementById('btn-logout')?.addEventListener('click', () => API.Auth.logout());
  }

  function shouldAutoRefreshLote() {
    if (Date.now() < state.interactionLockUntil) return false;
    if (state.queueControl?.hasInterruptedFlow) return false;
    return state.avisos.some((item) => ['pendiente', 'processing', 'procesando'].includes(String(item.estado_aviso || '').toLowerCase()));
  }

  function pauseAutoRefresh(durationMs = 12000) {
    state.interactionLockUntil = Date.now() + durationMs;
  }

  async function refrescarVistaEnVivo() {
    await Promise.all([cargarLote(true), cargarAvisos(true)]);
  }

  async function cargarLote(silencioso = false) {
    if (state.loadingLote) return;
    state.loadingLote = true;

    try {
      const data = await API.Lotes.obtener(rutaId);
      const ruta = data.data || {};
      const origen = ruta.origen || '-';
      const title = ruta.nombre_lote || `Ruta ${origen !== '-' ? origen : 'general'} - ${formatFecha(ruta.fecha)}`;
      const estado = String(ruta.estado || 'activo').toLowerCase();

      state.queueControl = whatsappUi.normalizeQueueControl(ruta.control_envio);

      SharedUI.setText('hero-lote-id', title);
      SharedUI.setText('hero-origen', origen);
      SharedUI.setText('hero-sede', ruta.sede_nombre || '-');
      SharedUI.setText('hero-fecha', formatFecha(ruta.fecha));
      SharedUI.setText('hero-obs', ruta.observacion || 'Sin observaciones');
      SharedUI.setText('hero-origin-pill', origen);
      SharedUI.setText('lote-estado-chip', capitalize(estado));
      const chip = document.getElementById('lote-estado-chip');
      if (chip) {
        const chipMap = {
          enviado: 'completado',
          entregado: 'completado',
          activo: 'activo',
          completado: 'completado',
          progreso: 'progress',
          pausado: 'pausado',
          pendiente: 'pendiente',
          fallido: 'cancelado',
          cancelado: 'cancelado',
          error: 'cancelado',
          sin_whatsapp: 'pendiente'
        };
        chip.className = `pg-badge pg-badge-${chipMap[estado] || 'progress'}`;
      }

      const statusPill = document.getElementById('hero-status-pill');
      if (statusPill) {
        statusPill.textContent = capitalize(estado);
        statusPill.className = `hero-inline-chip ${whatsappUi.getHeroStatusClass(estado)}`;
      }

      whatsappUi.renderEnvioInterruptionPanel();
    } catch {
      if (!silencioso) {
        mostrarToast('No se pudo cargar la informacion de la ruta.', 'error');
      }
    } finally {
      state.loadingLote = false;
    }
  }

  async function cargarAvisos(silencioso = false) {
    const tbody = document.getElementById('tabla-avisos-body');
    if (!tbody || state.loadingAvisos) return;

    if (!silencioso) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Cargando registros...</td></tr>';
    }

    state.loadingAvisos = true;
    try {
      const data = await API.Avisos.listarPorLote(rutaId);
      const nextAvisos = data.data || [];
      const nextSignature = tableModule.buildAvisosSignature(nextAvisos);
      const changed = nextSignature !== state.lastAvisosSignature;

      state.avisos = nextAvisos;
      state.lastAvisosSignature = nextSignature;

      if (!silencioso || changed) {
        tableModule.updateAvisosView({ forceRender: !silencioso });
        tableModule.updateCounters();
        whatsappUi.updateEnvioTimeline();
        whatsappUi.renderEnvioInterruptionPanel();
        templatesModule.updatePreview();
      }
    } catch (error) {
      if (!silencioso) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-row error-row">${SharedUI.escapeHtml(error?.message || 'Error al cargar registros.')}</td></tr>`;
      }
    } finally {
      state.loadingAvisos = false;
    }
  }

  async function cargarSesiones(silencioso = false) {
    const select = document.getElementById('select-sesion');
    if (!select || state.loadingSesiones) return;

    state.loadingSesiones = true;
    try {
      const data = await API.WhatsAppSesiones.listar();
      const sesiones = (data.data || []).map((item) => ({
        ...item,
        estado_real: String(item.estado_real || item.estado || 'disconnected').toLowerCase()
      }));
      state.sesiones = sesiones;
      const previousSelectedId = select.value;

      if (!sesiones.length) {
        select.innerHTML = '<option value="">No hay sesiones disponibles</option>';
        state.selectedSessionId = null;
        whatsappUi.updateSessionSummary();
        whatsappUi.renderEnvioInterruptionPanel();
        templatesModule.updatePreview();
        return;
      }

      const options = sesiones.map((item) => {
        const statusLabel = formatSessionStatus(item.estado_real || item.estado);
        const device = item.nombre_dispositivo || 'Dispositivo';
        return `<option value="${item.id}">${SharedUI.escapeHtml(device)} - ${statusLabel}</option>`;
      }).join('');

      select.innerHTML = sesiones.length === 1
        ? options
        : '<option value="">Seleccionar...</option>' + options;

      if (sesiones.length === 1) {
        select.value = String(sesiones[0].id);
      } else if (previousSelectedId && sesiones.some((item) => String(item.id) === String(previousSelectedId))) {
        select.value = previousSelectedId;
      }

      select.onchange = () => {
        whatsappUi.updateSessionSummary();
        whatsappUi.renderEnvioInterruptionPanel();
        templatesModule.updatePreview();
      };

      whatsappUi.updateSessionSummary();
      whatsappUi.renderEnvioInterruptionPanel();
      templatesModule.updatePreview();
    } catch (error) {
      if (!silencioso) {
        select.innerHTML = '<option value="">No disponibles</option>';
        state.selectedSessionId = null;
        const message = error?.serviceUnavailable
          ? 'WhatsApp no disponible. Puedes revisar la ruta, pero no enviar hasta que vuelva el worker.'
          : 'No se pudieron cargar las sesiones.';
        whatsappUi.updateSessionSummary(message, 'is-error');
        whatsappUi.renderEnvioInterruptionPanel();
        templatesModule.updatePreview();
      }
    } finally {
      state.loadingSesiones = false;
    }
  }

  function getSelectedSessionRecord() {
    const selectedId = document.getElementById('select-sesion')?.value;
    if (!selectedId) return null;
    return state.sesiones.find((item) => String(item.id) === String(selectedId)) || null;
  }

  async function eliminarDestinatario(id) {
    const aviso = state.avisos.find((item) => String(item.id) === String(id));
    const label = aviso?.nombre || aviso?.telefono || 'este destinatario';
    const confirmed = await SharedUI.confirm({ title: 'Eliminar destinatario', message: `Se eliminara ${label}. Deseas continuar?`, confirmText: 'Eliminar', cancelText: 'Cancelar', type: 'danger' });
    if (!confirmed) return;

    try {
      await API.Avisos.eliminar(id);
      mostrarToast('Destinatario eliminado.', 'success');
      await cargarAvisos();
    } catch (error) {
      mostrarToast(error?.message || 'No se pudo eliminar el destinatario.', 'error');
    }
  }

  function bindVaciarLote() {
    document.getElementById('btn-vaciar-lote')?.addEventListener('click', async () => {
      if (!state.avisos.length) {
        mostrarToast('No hay destinatarios para eliminar.', 'error');
        return;
      }

      const confirmed = await SharedUI.confirm({ title: 'Vaciar ruta', message: 'Se eliminaran todos los destinatarios de esta ruta. Deseas continuar?', confirmText: 'Eliminar todo', cancelText: 'Cancelar', type: 'danger' });
      if (!confirmed) return;

      try {
        const data = await API.Avisos.eliminarPorLote(rutaId);
        mostrarToast(data?.message || 'Lote vaciado correctamente.', 'success');
        await cargarAvisos();
      } catch (error) {
        mostrarToast(error?.message || 'No se pudo vaciar la ruta.', 'error');
      }
    });
  }

  function bindImportacion() {
    const modal = document.getElementById('tab-content-import');
    const btnAbrir = document.getElementById('btn-abrir-importacion');
    const btnCerrar = document.getElementById('btn-cerrar-importacion');
    const dropzone = document.getElementById('import-dropzone');
    const inputArchivo = document.getElementById('input-archivo-lote');
    const archivoNombre = document.getElementById('archivo-lote-nombre');
    const status = document.getElementById('import-status');

    const toggleImportModal = (open) => {
      if (!modal) return;

      if (open) {
        const rect = btnAbrir?.getBoundingClientRect();
        if (rect) {
          const panelWidth = 360;
          const gap = 10;
          const safeGap = 16;
          const left = Math.min(
            Math.max(safeGap, rect.right - panelWidth),
            window.innerWidth - panelWidth - safeGap,
          );
          const top = Math.min(rect.bottom + gap, window.innerHeight - 120);
          modal.style.setProperty('--import-popover-left', `${left}px`);
          modal.style.setProperty('--import-popover-top', `${Math.max(safeGap, top)}px`);
        }
        modal.hidden = false;
        window.requestAnimationFrame(() => modal.classList.add('open'));
        return;
      }

      modal.classList.remove('open');
      window.setTimeout(() => {
        if (!modal.classList.contains('open')) modal.hidden = true;
      }, 180);
    };

    btnAbrir?.addEventListener('click', () => {
      pauseAutoRefresh(15000);
      toggleImportModal(true);
    });
    btnCerrar?.addEventListener('click', () => toggleImportModal(false));
    document.addEventListener('pointerdown', (event) => {
      if (!modal?.classList.contains('open')) return;
      const target = event.target;
      if (modal.contains(target) || btnAbrir?.contains(target)) return;
      toggleImportModal(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal?.classList.contains('open')) {
        toggleImportModal(false);
      }
    });
    window.addEventListener('resize', () => {
      if (modal?.classList.contains('open')) toggleImportModal(true);
    });

    dropzone?.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', async (event) => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
      const file = event.dataTransfer?.files?.[0];
      if (file) await procesarArchivoImportacion(file);
    });
    inputArchivo?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (file) await procesarArchivoImportacion(file);
    });
    async function procesarArchivoImportacion(file) {
      if (archivoNombre) archivoNombre.textContent = file.name;
      showImportStatus('Procesando archivo', 'loading', 'Estamos leyendo y validando las columnas del Excel.');

      try {
        const rows = await dataModule.extractRowsFromFile(file);
        if (!rows.length) {
          showImportStatus('No se encontraron filas válidas', 'error', 'Revisa que el archivo tenga Nombre, Código y Teléfono.');
          return;
        }

        const data = await API.Avisos.importar({ lote_id: Number(rutaId), avisos: rows });
        showImportStatus('Importación completada', 'ok', `${data.importados || 0} destinatarios agregados correctamente a esta ruta.`);
        await cargarAvisos();
      } catch (error) {
        showImportStatus('No se pudo importar', 'error', error?.message || 'Intenta con otro archivo Excel o CSV.');
      }
    }

    function showImportBurst(detail = '') {
      const match = String(detail).match(/\d+/);
      const total = match ? match[0] : '';
      document.querySelector('.import-burst-toast')?.remove();

      const toast = document.createElement('div');
      toast.className = 'import-burst-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      toast.innerHTML = `
        <span class="import-burst-particles" aria-hidden="true">
          <i></i><i></i><i></i><i></i><i></i><i></i>
        </span>
        <span class="import-burst-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>
        </span>
        <span class="import-burst-copy">
          <strong>Carga completada</strong>
          <small>${total ? `${SharedUI.escapeHtml(total)} destinatarios agregados a la ruta` : 'Destinatarios agregados a la ruta'}</small>
        </span>
      `;
      document.body.appendChild(toast);
      window.requestAnimationFrame(() => toast.classList.add('show'));
      window.setTimeout(() => {
        toast.classList.add('hide');
        window.setTimeout(() => toast.remove(), 320);
      }, 3200);
    }

    function showImportStatus(title, type, detail = '') {
      if (!status) return;
      if (type === 'ok') {
        status.className = 'import-status';
        status.innerHTML = '';
        if (archivoNombre) archivoNombre.textContent = 'Ningun archivo seleccionado';
        if (inputArchivo) inputArchivo.value = '';
        toggleImportModal(false);
        showImportBurst(detail);
        return;
      }
      status.className = `import-status ${type}`;
      const icons = {
        ok: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        error: '<svg viewBox="0 0 24 24"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>',
        loading: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>',
      };
      status.innerHTML = `
        <span class="import-status-icon">${icons[type] || icons.ok}</span>
        <span class="import-status-copy">
          <strong>${SharedUI.escapeHtml(title)}</strong>
          ${detail ? `<small>${SharedUI.escapeHtml(detail)}</small>` : ''}
        </span>
      `;
    }
  }

  function bindNuevoAviso() {
    const modal = document.getElementById('modal-aviso');
    const form = document.getElementById('form-aviso');
    const avisoError = document.getElementById('aviso-error');
    const avisoSuccess = document.getElementById('aviso-success');
    const btnGuardar = document.getElementById('btn-guardar-aviso');

    const toggleModal = (open) => modal?.classList.toggle('open', open);
    const hideMessages = () => {
      if (avisoError) avisoError.style.display = 'none';
      if (avisoSuccess) avisoSuccess.style.display = 'none';
    };

    document.getElementById('btn-nuevo-aviso')?.addEventListener('click', () => {
      form?.reset();
      hideMessages();
      toggleModal(true);
    });
    document.getElementById('btn-cerrar-aviso')?.addEventListener('click', () => toggleModal(false));
    document.getElementById('btn-cancelar-aviso')?.addEventListener('click', () => toggleModal(false));
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) toggleModal(false);
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideMessages();

      const payload = {
        lote_id: Number(rutaId),
        telefono: document.getElementById('av-telefono')?.value.trim(),
        nombre: document.getElementById('av-nombre')?.value.trim(),
        codigo_paquete: document.getElementById('av-codigo')?.value.trim(),
        empresa_origen: document.getElementById('hero-origen')?.textContent?.trim() || '',
        mensaje: document.getElementById('av-mensaje')?.value.trim()
      };

      if (!payload.telefono) {
        if (avisoError) {
          avisoError.textContent = 'El telefono es obligatorio.';
          avisoError.style.display = 'block';
        }
        return;
      }

      setBtnLoading(btnGuardar, true, 'Guardando...');
      try {
        await API.Avisos.crear(payload);
        if (avisoSuccess) {
          avisoSuccess.textContent = 'Destinatario creado correctamente.';
          avisoSuccess.style.display = 'block';
        }
        await cargarAvisos();
        setTimeout(() => toggleModal(false), 900);
      } catch (error) {
        if (avisoError) {
          avisoError.textContent = error?.message || 'No se pudo crear el destinatario.';
          avisoError.style.display = 'block';
        }
      } finally {
        setBtnLoading(btnGuardar, false);
      }
    });
  }

  function bindEnvioLote() {
    const btn = document.getElementById('btn-enviar-lote');
    btn?.addEventListener('click', async () => {
      if (state.queueControl?.canResume || state.queueControl?.isPaused || state.queueControl?.hasInterruptedFlow) {
        whatsappUi.renderEnvioInterruptionPanel();
        const retomarBtn = document.getElementById('btn-retomar-interrumpido');
        if (retomarBtn && !retomarBtn.disabled) {
          retomarBtn.click();
        } else {
          mostrarToast('Esta ruta esta pausada. Selecciona una sesion activa para retomar o cancela los pendientes.', 'error');
        }
        return;
      }

      if (state.queueControl?.isProcessing || state.queueControl?.canPause) {
        whatsappUi.renderEnvioInterruptionPanel();
        mostrarToast('Esta ruta ya esta enviando. Puedes pausarla desde el control de envio.', 'error');
        return;
      }

      const sesionId = document.getElementById('select-sesion')?.value;
      const pendientes = state.avisos.filter((item) => item.estado_aviso === 'pendiente').length;
      const selectedPlantilla = state.plantillas.find((item) => String(item.id) === String(state.selectedPlantillaId));

      if (!sesionId) {
        mostrarToast('Selecciona una sesion antes de enviar.', 'error');
        return;
      }
      if (!state.selectedPlantillaId) {
        mostrarToast('Selecciona una plantilla antes de enviar.', 'error');
        return;
      }
      if (!pendientes) {
        mostrarToast('No hay mensajes pendientes para enviar.', 'error');
        return;
      }

      const confirmed = await whatsappUi.solicitarConfirmacionEnvio({
        pendientes,
        sesionId,
        plantillaNombre: templatesModule.getPlantillaNombre(selectedPlantilla),
        imagen: selectedPlantilla?.imagen_path ? 'Incluida en plantilla' : null
      });
      if (!confirmed) return;

      setBtnLoading(btn, true, 'Preparando cola...');
      whatsappUi.setEnvioVisualState('loading', {
        title: 'Preparando envios',
        message: 'Estamos verificando tu conexion de WhatsApp y preparando los mensajes para garantizar una entrega segura.',
        meta: [`${pendientes} pendientes`, selectedPlantilla?.imagen_path ? 'Con imagen' : 'Solo texto']
      });

      try {
        const data = await API.WhatsAppEnvio.enviarLote(
          Number(rutaId),
          Number(sesionId),
          state.selectedPlantillaId ? Number(state.selectedPlantillaId) : null,
          null
        );

        whatsappUi.setEnvioVisualState('queued', {
          title: 'Lote encolado correctamente',
          message: 'Tus mensajes se estan enviando de forma segura uno a uno. Puedes ver el progreso real en la tabla inferior.',
          meta: [
            `${Number(data.queued || 0)} listos para enviar`,
            Number(data.skipped || 0) > 0 ? `${Number(data.skipped)} omitidos` : null,
            'Monitor en vivo activo'
          ]
        });

        await cargarAvisos();
        await cargarLote();
        await cargarSesiones();
        void progressPoller.tick?.();
        void sessionPoller.tick?.();
      } catch (error) {
        if (error?.data?.requiresIntervention) {
          state.queueControl = whatsappUi.normalizeQueueControl(error.data.control);
          whatsappUi.renderEnvioInterruptionPanel();
        }

        whatsappUi.setEnvioVisualState('error', {
          title: 'No se pudo encolar la ruta',
          message: error?.message || 'Hubo un problema al preparar el envio. Verifica la sesion y vuelve a intentarlo.',
          meta: ['Sin cambios en los pendientes']
        });
        mostrarToast(error?.message || 'Error al encolar ruta.', 'error');
      } finally {
        setBtnLoading(btn, false);
      }
    });
  }

  function mostrarToast(message, type = 'success') {
    SharedUI.showToast(message, type, { elementId: 'toast' });
  }

  function setBtnLoading(btn, loading, label) {
    SharedUI.setButtonLoading(btn, loading, label);
  }

  function formatFecha(value) {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatFechaHora(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function capitalize(value) {
    return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
  }

  function formatSessionStatus(value) {
    const status = String(value || 'disconnected').toLowerCase();
    if (status === 'connected') return 'Activa';
    if (status === 'authenticated') return 'Autenticada';
    if (status === 'initializing') return 'Iniciando';
    if (status === 'waiting_qr') return 'Esperando QR';
    if (status === 'reconnecting') return 'Reconectando';
    if (status === 'auth_failure') return 'Error';
    if (status === 'disconnected') return 'Inactiva';
    return capitalize(status);
  }
});
