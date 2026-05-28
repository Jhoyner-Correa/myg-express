document.addEventListener('DOMContentLoaded', async () => {
  API.Auth.requireAuth();
  API.ensureSuperadminSidebar();

  const currentUser = API.getUser();
  const ui = window.SharedUI || {};
  const state = {
    rutas: [],
    editandoId: null
  };

  const helpers = {
    escapeHtml: ui.escapeHtml || ((value) => String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')),
    setText: ui.setText || ((id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    }),
    setButtonLoading: ui.setButtonLoading || ((button, loading, options = {}) => {
      if (!button) return;
      const originalText = button.dataset.originalText || button.textContent || '';
      if (!button.dataset.originalText) {
        button.dataset.originalText = originalText;
      }
      button.disabled = Boolean(loading);
      button.innerHTML = loading
        ? `<span class="spinner"></span> ${options.loadingText || 'Guardando...'}`
        : (options.idleText || originalText);
    }),
    showToast: ui.showToast || ((message, type = 'info', options = {}) => {
      const toast = document.getElementById('toast');
      if (!toast) {
        window.alert(message);
        return;
      }

      const title = options.title || (
        type === 'success' ? 'Operación completada'
          : type === 'error' ? 'No se pudo completar'
            : type === 'warning' ? 'Revisa esto'
              : 'Información'
      );

      const icon = type === 'success'
        ? '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        : type === 'error'
          ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
          : type === 'warning'
            ? '<svg viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
            : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>';

      toast.className = `toast toast-${type} show`;
      toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-copy">
          <div class="toast-title">${helpers.escapeHtml(title)}</div>
          <div class="toast-content">${helpers.escapeHtml(message)}</div>
        </div>
        <div class="toast-progress"></div>
      `;

      clearTimeout(window.__routesToastTimer__);
      window.__routesToastTimer__ = setTimeout(() => {
        toast.classList.remove('show');
      }, options.durationMs || 4000);
    })
  };

  hydrateChrome();
  bindModal();
  bindSearch();
  bindReportModal();
  await loadRoutes();

  function hydrateChrome() {
    helpers.setText('user-nombre', currentUser?.nombre || 'Usuario');
    helpers.setText('user-sede', currentUser?.sede_nombre || '-');
    helpers.setText('user-rol', currentUser?.rol || '-');
    helpers.setText('user-avatar', (currentUser?.nombre || 'U').charAt(0).toUpperCase());
    document.getElementById('btn-logout')?.addEventListener('click', () => API.Auth.logout());
  }

  function normalizeRouteName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function validateRouteName(value) {
    const normalized = normalizeRouteName(value);

    if (!normalized) {
      return 'Debes escribir el nombre de la ruta.';
    }

    if (/\d/.test(normalized)) {
      return 'El nombre de la ruta no puede contener números. El número se genera automáticamente.';
    }

    if (!/^[\p{L}\s.'-]+$/u.test(normalized)) {
      return 'Usa solo letras y separadores simples en el nombre de la ruta.';
    }

    return '';
  }

  function getEditableRouteName(value) {
    const nombre = String(value || '').trim();
    const match = nombre.match(/^Ruta\s+\d+\s*-\s*(.+)$/i);
    return match ? match[1].trim() : nombre;
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function formatStatus(value) {
    const status = String(value || 'pendiente').toLowerCase();
    if (status === 'procesando') return 'Procesando';
    if (status === 'completado') return 'Completado';
    if (status === 'cancelado') return 'Cancelado';
    if (status === 'pausado') return 'Pausado';
    return 'Pendiente';
  }

  function getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function bindModal() {
    const modal = document.getElementById('modal-lote');
    const form = document.getElementById('form-lote');
    const saveButton = document.getElementById('btn-guardar-lote');
    const inputName = document.getElementById('input-nombre-lote');
    const modalTitle = document.querySelector('#modal-lote .modal-title');

    const openCreateModal = () => {
      form?.reset();
      state.editandoId = null;
      if (modalTitle) modalTitle.textContent = 'Crear nueva ruta';
      if (saveButton) saveButton.textContent = 'Crear ruta ahora';
      modal?.classList.add('open');
      inputName?.focus();
    };

    const closeModal = () => {
      modal?.classList.remove('open');
    };

    document.getElementById('btn-nuevo-lote')?.addEventListener('click', openCreateModal);
    document.getElementById('btn-cerrar-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancelar-modal')?.addEventListener('click', closeModal);

    modal?.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();

      const customName = normalizeRouteName(inputName?.value);
      const validationMessage = validateRouteName(customName);
      if (validationMessage) {
        helpers.showToast(validationMessage, 'warning', { title: 'Nombre inválido' });
        return;
      }

      if (state.editandoId) {
        await submitRouteUpdate(state.editandoId, customName, saveButton, closeModal);
        return;
      }

      await submitRouteCreate(customName, saveButton, closeModal);
    });

    document.addEventListener('click', (event) => {
      const editButton = event.target.closest('.btn-editar');
      if (editButton) {
        const id = editButton.getAttribute('data-id');
        const baseName = editButton.getAttribute('data-base-name') || '';
        state.editandoId = id;
        if (modalTitle) modalTitle.textContent = 'Editar ruta';
        if (saveButton) saveButton.textContent = 'Guardar cambios';
        if (inputName) inputName.value = baseName === '-' ? '' : baseName;
        modal?.classList.add('open');
        inputName?.focus();
        return;
      }

      const reportButton = event.target.closest('.btn-reporte');
      if (reportButton) {
        const id = reportButton.getAttribute('data-id');
        openReportModal(id);
      }
    });
  }

  async function submitRouteUpdate(routeId, customName, saveButton, closeModal) {
    helpers.setButtonLoading(saveButton, true, {
      loadingText: 'Guardando...',
      idleText: 'Guardar cambios'
    });

    try {
      const response = await API.Lotes.actualizar(routeId, customName);
      if (!response?.ok) {
        throw new Error(response?.message || 'No se pudo actualizar la ruta.');
      }

      helpers.showToast('La ruta se actualizó correctamente.', 'success', {
        title: 'Ruta actualizada'
      });
      await loadRoutes();
      setTimeout(closeModal, 900);
    } catch (error) {
      helpers.showToast(error?.message || 'Error al actualizar la ruta.', 'error', {
        title: 'No se pudo actualizar'
      });
    } finally {
      helpers.setButtonLoading(saveButton, false, {
        idleText: 'Guardar cambios'
      });
    }
  }

  async function submitRouteCreate(customName, saveButton, closeModal) {
    const payload = {
      origen: 'Temu',
      nombre_lote: customName,
      observacion: ''
    };

    helpers.setButtonLoading(saveButton, true, {
      loadingText: 'Creando...',
      idleText: 'Crear ruta ahora'
    });

    try {
      const response = await API.Lotes.crear(payload);
      if (!response?.ok) {
        throw new Error(response?.message || 'No se pudo crear la ruta.');
      }

      helpers.showToast('La ruta se creó correctamente.', 'success', {
        title: 'Ruta creada'
      });
      await loadRoutes();
      setTimeout(closeModal, 900);
    } catch (error) {
      helpers.showToast(error?.message || 'Error al crear la ruta.', 'error', {
        title: 'No se pudo crear'
      });
    } finally {
      helpers.setButtonLoading(saveButton, false, {
        idleText: 'Crear ruta ahora'
      });
    }
  }

  function bindReportModal() {
    document.getElementById('btn-cerrar-reporte')?.addEventListener('click', () => {
      document.getElementById('modal-reporte')?.classList.remove('open');
    });

    document.getElementById('modal-reporte')?.addEventListener('click', (event) => {
      if (event.target?.id === 'modal-reporte') {
        event.target.classList.remove('open');
      }
    });
  }

  async function openReportModal(routeId) {
    const modal = document.getElementById('modal-reporte');
    const body = document.getElementById('reporte-body');
    if (!modal || !body) return;

    modal.classList.add('open');
    body.innerHTML = '<div style="text-align:center; padding:30px; color:var(--gray-400);"><span class="spinner"></span> Calculando métricas...</div>';

    try {
      const response = await API.Avisos.listarPorLote(routeId);
      const avisos = response?.data || [];
      const summary = buildReportSummary(avisos);
      body.innerHTML = buildReportMarkup(summary);
    } catch (_error) {
      body.innerHTML = '<div style="text-align:center; padding:30px; color:#ef4444;">Error al cargar las métricas.</div>';
    }
  }

  function buildReportSummary(avisos) {
    const summary = {
      total: avisos.length,
      enviados: 0,
      pendientes: 0,
      fallidos: 0,
      leidos: 0,
      sinWhatsapp: 0
    };

    avisos.forEach((aviso) => {
      const status = String(aviso.estado_aviso || '').toLowerCase();
      if (status === 'enviado' || status === 'entregado') summary.enviados += 1;
      else if (status === 'leido' || status === 'leído') summary.leidos += 1;
      else if (status === 'pendiente') summary.pendientes += 1;
      else if (status === 'fallido' || status === 'error' || status === 'auth_failure') summary.fallidos += 1;
      else if (status === 'sin_whatsapp') summary.sinWhatsapp += 1;
    });

    return summary;
  }

  function buildReportMarkup(summary) {
    return `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
        <div style="background:var(--gray-50); padding:16px; border-radius:12px; text-align:center; border:1px solid var(--gray-200);">
          <div style="font-size:2rem; font-weight:700; color:var(--gray-900);">${summary.total}</div>
          <div style="font-size:0.75rem; color:var(--gray-500); font-weight:700; text-transform:uppercase;">Total registros</div>
        </div>
        <div style="background:#f0fdf4; padding:16px; border-radius:12px; text-align:center; border:1px solid #bbf7d0;">
          <div style="font-size:2rem; font-weight:700; color:#16a34a;">${summary.enviados + summary.leidos}</div>
          <div style="font-size:0.75rem; color:#15803d; font-weight:700; text-transform:uppercase;">Procesados</div>
        </div>
      </div>
      <div style="margin-top:24px;">
        <h4 style="font-size:0.9rem; font-family:'Syne', sans-serif; font-weight:700; color:var(--gray-900); margin-bottom:12px; border-bottom:1px solid var(--gray-200); padding-bottom:8px;">Desglose de estados</h4>
        ${buildReportLine('#eab308', 'Pendientes', summary.pendientes, true)}
        ${buildReportLine('#22c55e', 'Enviados', summary.enviados, true)}
        ${buildReportLine('#3b82f6', 'Leídos', summary.leidos, true)}
        ${buildReportLine('#ef4444', 'Fallidos / errores', summary.fallidos, true)}
        ${buildReportLine('#8b5cf6', 'Sin WhatsApp', summary.sinWhatsapp, false)}
      </div>
    `;
  }

  function buildReportLine(color, label, value, withDivider) {
    return `
      <div style="display:flex; justify-content:space-between; padding:10px 0;${withDivider ? ' border-bottom:1px solid var(--gray-100);' : ''}">
        <span style="color:var(--gray-600); display:flex; align-items:center; gap:8px;">
          <span style="width:8px; height:8px; border-radius:50%; background:${color};"></span> ${label}
        </span>
        <strong style="color:var(--gray-900);">${value}</strong>
      </div>
    `;
  }

  function bindSearch() {
    const input = document.getElementById('input-buscar');
    input?.addEventListener('input', () => {
      renderRoutes(input.value.trim().toLowerCase());
    });
  }

  async function loadRoutes() {
    const tbodyToday = document.getElementById('tabla-lotes-hoy');
    const tbodyHistory = document.getElementById('tabla-lotes-historial');

    if (tbodyToday) tbodyToday.innerHTML = '<tr><td colspan="7" class="empty-row">Cargando rutas...</td></tr>';
    if (tbodyHistory) tbodyHistory.innerHTML = '<tr><td colspan="7" class="empty-row">Cargando historial...</td></tr>';

    try {
      const response = await API.Lotes.listar();
      state.rutas = response?.data || [];
      helpers.setText('lotes-count', state.rutas.length);
      const searchValue = document.getElementById('input-buscar')?.value.trim().toLowerCase() || '';
      renderRoutes(searchValue);
    } catch (_error) {
      if (tbodyToday) tbodyToday.innerHTML = '<tr><td colspan="7" class="empty-row error-row">Error al cargar las rutas.</td></tr>';
      if (tbodyHistory) tbodyHistory.innerHTML = '<tr><td colspan="7" class="empty-row error-row">Error al cargar el historial.</td></tr>';
    }
  }

  function renderRoutes(query = '') {
    const tbodyToday = document.getElementById('tabla-lotes-hoy');
    const tbodyHistory = document.getElementById('tabla-lotes-historial');
    if (!tbodyToday || !tbodyHistory) return;

    const filteredRoutes = state.rutas.filter((item) => {
      if (!query) return true;
      const haystack = [
        item.nombre_lote,
        item.origen,
        item.observacion,
        item.sede_nombre
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(query);
    });

    const todayKey = getTodayKey();
    const routesToday = filteredRoutes.filter((route) => String(route.fecha || '').startsWith(todayKey));
    const routesHistory = filteredRoutes.filter((route) => !String(route.fecha || '').startsWith(todayKey));

    tbodyToday.innerHTML = routesToday.length
      ? routesToday.map((route, index) => renderRouteRow(route, index)).join('')
      : '<tr><td colspan="7" class="empty-row">No hay rutas registradas hoy.</td></tr>';

    tbodyHistory.innerHTML = routesHistory.length
      ? routesHistory.map((route, index) => renderRouteRow(route, index)).join('')
      : '<tr><td colspan="7" class="empty-row">No hay historial de rutas anteriores.</td></tr>';
  }

  function renderRouteRow(route, index) {
    const nombre = route.nombre_lote || 'Ruta sin nombre';
    const nombreEditable = getEditableRouteName(nombre);
    const estado = String(route.estado || 'pendiente').toLowerCase();
    const observacion = route.observacion
      ? `<div class="lote-submeta">${helpers.escapeHtml(route.observacion)}</div>`
      : '';

    return `
      <tr data-id="${route.id}">
        <td style="text-align:center; font-weight:700; color:var(--gray-400);">${index + 1}</td>
        <td>
          <div class="lote-nombre">${helpers.escapeHtml(nombre)}</div>
          ${observacion}
        </td>
        <td><span class="badge-origen">${helpers.escapeHtml(route.origen || '-')}</span></td>
        <td>${formatDate(route.fecha)}</td>
        <td><span class="paquetes-count">${Number(route.total_registros || 0)}</span></td>
        <td><span class="estado-badge estado-${helpers.escapeHtml(estado)}">${formatStatus(estado)}</span></td>
        <td>
          <div class="action-buttons">
            <button class="btn-reporte" data-id="${route.id}" title="Ver reporte">
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
            </button>
            <button class="btn-editar" data-id="${route.id}" data-base-name="${helpers.escapeHtml(nombreEditable)}" title="Editar ruta">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <a href="${API.Routes.loteDetalle(route.id, nombre)}" class="btn-ver" title="Ver detalle">
              Ver detalle
              <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </a>
          </div>
        </td>
      </tr>
    `;
  }
});
