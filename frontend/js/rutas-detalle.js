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
    selectedSessionId: null,
    editingPlantillaId: null,
    templateImageBase64: null,
    templateImageName: null,
    templateImageBorrar: false,
    searchQuery: '',
    currentPage: 1,
    pageSize: 10,
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
  tableModule.bindPaginacion();
  tableModule.bindRowActions();
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
    if (!window.confirm(`Se eliminara ${label}. Deseas continuar?`)) return;

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

      if (!window.confirm('Se eliminaran todos los destinatarios de esta ruta. Deseas continuar?')) return;

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
    const dropzone = document.getElementById('import-dropzone');
    const inputArchivo = document.getElementById('input-archivo-lote');
    const archivoNombre = document.getElementById('archivo-lote-nombre');
    const status = document.getElementById('import-status');
    const btnLimpiar = document.getElementById('btn-limpiar-importacion');

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
    btnLimpiar?.addEventListener('click', () => {
      if (inputArchivo) inputArchivo.value = '';
      if (archivoNombre) archivoNombre.textContent = 'Ningun archivo seleccionado';
      if (status) {
        status.className = 'import-status';
        status.textContent = '';
      }
      if (btnLimpiar) btnLimpiar.style.display = 'none';
    });

    async function procesarArchivoImportacion(file) {
      if (archivoNombre) archivoNombre.textContent = file.name;
      showImportStatus('Procesando archivo...', 'ok');

      try {
        const rows = await dataModule.extractRowsFromFile(file);
        if (!rows.length) {
          showImportStatus('No se encontraron filas validas para importar.', 'error');
          return;
        }

        const data = await API.Avisos.importar({ lote_id: Number(rutaId), avisos: rows });
        showImportStatus(`Se importaron ${data.importados} destinatarios a la ruta.`, 'ok');
        if (btnLimpiar) btnLimpiar.style.display = 'inline-flex';
        await cargarAvisos();
      } catch (error) {
        showImportStatus(error?.message || 'No se pudo importar el archivo.', 'error');
      }
    }

    function showImportStatus(message, type) {
      if (!status) return;
      status.className = `import-status ${type}`;
      status.textContent = message;
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
      if (state.queueControl?.hasInterruptedFlow && state.queueControl.pausedJobs > 0) {
        whatsappUi.renderEnvioInterruptionPanel();
        mostrarToast('Esta ruta esta pausada. Primero decide si retomas, marcas manualmente o cancelas los pendientes.', 'error');
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
        mostrarToast('La ruta ya fue encolada para WhatsApp.', 'success');
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
