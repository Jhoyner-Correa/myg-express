(function () {
  'use strict';

  if (!window.API?.Auth?.requirePermission('entregas.ver')) return;

  const $ = (id) => document.getElementById(id);
  const ui = window.SharedUI || {};
  const escapeHtml = ui.escapeHtml || ((value) => String(value ?? ''));
  const toast = ui.showToast || ((message) => alert(message));
  const user = API.Auth.getUser?.() || {};

  const state = {
    clients: [],
    selectedClient: null,
    packages: [],
    hasSearched: false,
    pendingDeliveryId: null
  };

  const els = {
    search: $('input-entrega-search'),
    clearSearch: $('btn-clear-search'),
    searchBtn: $('btn-search-entregas'),
    estado: $('filter-estado'),
    fecha: $('filter-fecha'),
    lote: $('filter-lote'),
    reset: $('btn-reset-filters'),
    exportBtn: $('btn-export-entregas'),
    clientsList: $('clientes-list'),
    meta: $('results-meta'),
    emptyProfile: $('cliente-profile-empty'),
    profile: $('cliente-profile'),
    clientName: $('cliente-name'),
    clientPhone: $('cliente-phone'),
    clientSede: $('cliente-sede'),
    profilePending: $('profile-pending'),
    profileDone: $('profile-done'),
    profileLast: $('profile-last'),
    pendingCount: $('pending-package-count'),
    doneCount: $('done-package-count'),
    pendingList: $('pending-packages'),
    doneList: $('done-packages'),
    modal: $('delivery-modal'),
    modalClose: $('delivery-modal-close'),
    modalCancel: $('delivery-modal-cancel'),
    modalConfirm: $('delivery-modal-confirm'),
    modalClientName: $('modal-client-name'),
    modalPackageCode: $('modal-package-code'),
    modalPackageRoute: $('modal-package-route'),
    modalPackageWeight: $('modal-package-weight'),
    modalPackageType: $('modal-package-type'),
    modalPackageDate: $('modal-package-date'),
    modalObservation: $('modal-observation'),
    userRol: $('user-rol-topbar'),
    topbarPending: $('topbar-pending'),
    topbarDone: $('topbar-done')
  };

  function maskPhone(phone) {
    const clean = String(phone || '').replace(/\D/g, '');
    if (clean.length < 6) return phone || 'Sin telefono';
    return `${clean.slice(0, 3)} *** ${clean.slice(-3)}`;
  }

  function formatDate(value, withTime = false) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
    }).format(date);
  }

  function formatRelativeDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const valueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diffDays = Math.round((dayStart - valueStart) / 86400000);

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    return formatDate(value);
  }

  function routeLabel(item) {
    const route = item.ruta || {};
    return route.nombre || `Ruta ${route.id || item.lote_id || '-'}`;
  }

  function formatWeight(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 'Sin peso';
    return `${parsed.toFixed(parsed >= 10 ? 1 : 3).replace(/\.?0+$/, '')} kg`;
  }

  function packageType(item) {
    return item.tamano_paquete?.label || item.tipo_paquete_urbano || 'Sin tipo';
  }

  function packageTypeCode(item) {
    return item.tamano_paquete?.codigo || 'sin_tipo';
  }

  function packageDetail(item) {
    const pieces = Number(item.piezas || 0);
    const content = item.contenido_paquete ? String(item.contenido_paquete) : '';
    const parts = [];
    if (item.tamano_paquete?.rango) parts.push(item.tamano_paquete.rango);
    if (item.tipo_paquete_urbano) parts.push(`Urbano: ${item.tipo_paquete_urbano}`);
    if (pieces > 0) parts.push(`${pieces} ${pieces === 1 ? 'pieza' : 'piezas'}`);
    if (content) parts.push(content);
    return parts.join(' - ');
  }

  function getSearchParams() {
    return {
      q: els.search?.value || '',
      estado: els.estado?.value || '',
      fecha: els.fecha?.value || '',
      lote_id: els.lote?.value || '',
      limit: 40
    };
  }

  function setSearchLoading(loading) {
    if (ui.setButtonLoading) {
      ui.setButtonLoading(els.searchBtn, loading, 'Buscando...');
      return;
    }
    if (els.searchBtn) els.searchBtn.disabled = loading;
  }

  function setModalLoading(loading) {
    if (ui.setButtonLoading) {
      ui.setButtonLoading(els.modalConfirm, loading, 'Confirmando...');
      return;
    }
    if (els.modalConfirm) els.modalConfirm.disabled = loading;
  }

  function renderClientEmpty(title, text) {
    if (!els.clientsList) return;
    els.clientsList.innerHTML = `
      <div class="ge-empty ge-empty-compact">
        <div class="ge-empty-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="m20 20-3.5-3.5"></path>
          </svg>
        </div>
        <strong>${escapeHtml(title)}</strong>
        ${text ? `<span>${escapeHtml(text)}</span>` : ''}
      </div>
    `;
  }

  function renderClients() {
    if (!state.hasSearched) {
      renderClientEmpty('Busca un cliente');
      if (els.meta) els.meta.textContent = 'Busca por apellido, nombre, telefono o codigo.';
      return;
    }

    if (!state.clients.length) {
      renderClientEmpty('Sin coincidencias', 'Prueba con otro apellido, telefono o codigo.');
      if (els.meta) els.meta.textContent = 'No se encontraron clientes con esos datos.';
      return;
    }

    const query = (els.search?.value || '').trim();
    if (els.meta) {
      els.meta.textContent = query
        ? `Resultados para "${query}"`
        : `${state.clients.length} clientes encontrados`;
    }

    els.clientsList.innerHTML = state.clients.map((client) => {
      const active = state.selectedClient?.cliente_key === client.cliente_key;
      const pending = Number(client.pendientes || 0);
      const done = Number(client.recogidos || 0);
      const last = client.ultimo_ingreso ? formatRelativeDate(client.ultimo_ingreso).toLowerCase() : '-';

      const multiBadge = pending > 1
        ? `<span class="ge-multipack-badge" title="Este cliente tiene ${pending} paquetes pendientes">${pending} paq.</span>`
        : '';

      return `
        <button class="ge-client-card ${active ? 'active' : ''}" type="button" data-client-key="${escapeHtml(client.cliente_key)}">
          <span class="ge-client-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </span>
          <span class="ge-client-main">
            <span class="ge-client-name">${escapeHtml(client.nombre || 'Sin nombre')}</span>
            <span class="ge-client-phone">Tel: ${escapeHtml(maskPhone(client.telefono))}</span>
            <span class="ge-client-stats">
              ${pending === 0 
                ? '<span class="status-pending zero">0 pendientes</span>' 
                : pending === 1 
                  ? '<span class="status-pending one">1 paquete pendiente</span>' 
                  : `<span class="status-pending many">${pending} paquetes pendientes</span>`
              }
              <span class="status-sep">|</span>
              <span class="status-done">${done} recogido${done === 1 ? '' : 's'}</span>
            </span>
            <span class="ge-client-last">Último ingreso: <strong class="last-time">${escapeHtml(last)}</strong></span>
          </span>
        </button>
      `;
    }).join('');
  }

  async function loadRouteOptions() {
    if (!els.lote) return;
    try {
      const response = await API.Rutas.listar();
      const routes = Array.isArray(response.data) ? response.data : [];
      els.lote.innerHTML = '<option value="">Todas</option>' + routes
        .map((route) => `<option value="${escapeHtml(route.id)}">${escapeHtml(route.nombre_lote || `Ruta ${route.id}`)}</option>`)
        .join('');
    } catch {
      els.lote.innerHTML = '<option value="">Todas</option>';
    }
  }

  function showProfile(show) {
    els.emptyProfile?.classList.toggle('hidden', show);
    els.profile?.classList.toggle('hidden', !show);
  }

  function tableEmpty(colspan, message) {
    return `<tr><td class="ge-table-empty" colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
  }

  function setTopbarStats(stats) {
    if (els.topbarPending) els.topbarPending.textContent = Number(stats?.pendientes || 0);
    if (els.topbarDone) els.topbarDone.textContent = Number(stats?.recogidos || 0);
  }

  function pendingRow(item) {
    return `
      <tr>
        <td>${escapeHtml(item.codigo_paquete || 'Sin codigo')}</td>
        <td>${escapeHtml(routeLabel(item))}</td>
        <td>${escapeHtml(formatRelativeDate(item.fecha_ingreso))}</td>
        <td>${escapeHtml(formatWeight(item.peso_kg))}</td>
        <td>
          <span class="ge-package-type size-${escapeHtml(packageTypeCode(item))}" title="${escapeHtml(packageDetail(item))}">${escapeHtml(packageType(item))}</span>
        </td>
        <td><span class="ge-status-pill">Disponible</span></td>
        <td class="ge-row-actions-cell">
          <button class="ge-row-action" type="button" data-action="recoger" data-id="${escapeHtml(item.id)}">Marcar recogido</button>
        </td>
      </tr>
    `;
  }

  function doneRow(item) {
    return `
      <tr>
        <td>${escapeHtml(item.codigo_paquete || 'Sin codigo')}</td>
        <td>${escapeHtml(routeLabel(item))}</td>
        <td>${escapeHtml(formatWeight(item.peso_kg))}</td>
        <td>
          <span class="ge-package-type size-${escapeHtml(packageTypeCode(item))}" title="${escapeHtml(packageDetail(item))}">${escapeHtml(packageType(item))}</span>
        </td>
        <td>Recogido en oficina</td>
      </tr>
    `;
  }

  function renderPackages() {
    const client = state.selectedClient;
    if (!client) {
      showProfile(false);
      if (els.exportBtn) els.exportBtn.disabled = true;
      return;
    }

    showProfile(true);
    const pending = state.packages.filter((item) => item.estado_entrega === 'pendiente');
    const done = state.packages.filter((item) => item.estado_entrega === 'recogido');
    const last = state.packages
      .map((item) => item.fecha_ingreso)
      .filter(Boolean)
      .sort()
      .pop();

    if (els.clientName) els.clientName.textContent = client.nombre || 'Sin nombre';
    if (els.clientPhone) els.clientPhone.textContent = client.telefono || 'No registrado';
    if (els.clientSede) els.clientSede.textContent = user.sede_nombre || user.sede || 'La Merced';
    if (els.profilePending) els.profilePending.textContent = pending.length;
    if (els.profileDone) els.profileDone.textContent = done.length;
    if (els.profileLast) els.profileLast.textContent = formatRelativeDate(last);
    if (els.pendingCount) els.pendingCount.textContent = pending.length;
    if (els.doneCount) els.doneCount.textContent = done.length;
    if (els.exportBtn) els.exportBtn.disabled = !state.packages.length;

    if (els.pendingList) {
      els.pendingList.innerHTML = pending.length
        ? pending.map(pendingRow).join('')
        : tableEmpty(7, 'Este cliente no tiene paquetes pendientes por recoger.');
    }

    if (els.doneList) {
      els.doneList.innerHTML = done.length
        ? done.map(doneRow).join('')
        : tableEmpty(5, 'Todavia no hay paquetes recogidos para este cliente.');
    }
  }

  async function searchClients() {
    const q = (els.search?.value || '').trim();
    const hasFilter = Boolean(els.estado?.value || els.fecha?.value || els.lote?.value);
    if (!q && !hasFilter) {
      toast('Ingresa un apellido, nombre, telefono o codigo de paquete.', 'warning');
      els.search?.focus();
      return;
    }

    setSearchLoading(true);
    try {
      const response = await API.Entregas.buscarClientes(getSearchParams());
      state.clients = Array.isArray(response.data) ? response.data : [];
      state.selectedClient = null;
      state.packages = [];
      state.hasSearched = true;
      renderClients();
      renderPackages();
    } catch (error) {
      state.clients = [];
      state.selectedClient = null;
      state.packages = [];
      state.hasSearched = true;
      renderClients();
      renderPackages();
      toast(error.message || 'No se pudo buscar clientes.', 'error');
    } finally {
      setSearchLoading(false);
    }
  }

  async function selectClient(clientKey) {
    const client = state.clients.find((item) => item.cliente_key === clientKey);
    if (!client) return;

    state.selectedClient = client;
    renderClients();
    showProfile(true);

    try {
      const response = await API.Entregas.paquetesCliente(clientKey);
      state.packages = Array.isArray(response.data) ? response.data : [];
      renderPackages();
    } catch (error) {
      state.packages = [];
      renderPackages();
      toast(error.message || 'No se pudo cargar la ficha del cliente.', 'error');
    }
  }

  function openDeliveryModal(item) {
    if (!item || !els.modal) return;
    state.pendingDeliveryId = item.id;
    if (els.modalClientName) els.modalClientName.textContent = state.selectedClient?.nombre || item.cliente || 'Cliente';
    if (els.modalPackageCode) els.modalPackageCode.textContent = item.codigo_paquete || 'Sin codigo';
    if (els.modalPackageRoute) els.modalPackageRoute.textContent = routeLabel(item);
    if (els.modalPackageWeight) els.modalPackageWeight.textContent = formatWeight(item.peso_kg);
    if (els.modalPackageType) els.modalPackageType.textContent = packageType(item);
    if (els.modalPackageDate) els.modalPackageDate.textContent = formatDate(item.fecha_ingreso);
    if (els.modalObservation) els.modalObservation.value = 'Entregado con DNI fisico';
    els.modal.classList.add('open');
    els.modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => els.modalObservation?.focus(), 80);
  }

  function closeDeliveryModal() {
    state.pendingDeliveryId = null;
    els.modal?.classList.remove('open');
    els.modal?.setAttribute('aria-hidden', 'true');
  }

  async function confirmDelivery() {
    const id = state.pendingDeliveryId;
    if (!id) return;

    setModalLoading(true);
    try {
      const clientKey = state.selectedClient?.cliente_key;
      const observation = (els.modalObservation?.value || '').trim() || 'Recogido en oficina';
      await API.Entregas.marcarRecogido(id, observation);
      closeDeliveryModal();
      toast('Entrega confirmada correctamente.', 'success');
      await loadGlobalStats();
      await searchClients();
      if (clientKey && state.clients.some((client) => client.cliente_key === clientKey)) {
        await selectClient(clientKey);
      }
    } catch (error) {
      toast(error.message || 'No se pudo confirmar la entrega.', 'error');
    } finally {
      setModalLoading(false);
    }
  }

  function markPicked(id) {
    const item = state.packages.find((row) => String(row.id) === String(id));
    if (!item) {
      toast('No se encontro el paquete seleccionado.', 'error');
      return;
    }
    openDeliveryModal(item);
  }

  async function markPending(id) {
    const confirmed = ui.confirm
      ? await ui.confirm({
          title: 'Revertir entrega',
          message: 'El paquete volvera a la lista de pendientes.',
          confirmText: 'Revertir',
          cancelText: 'Cancelar',
          type: 'warning'
        })
      : window.confirm('Revertir a pendiente?');

    if (!confirmed) return;

    try {
      const clientKey = state.selectedClient?.cliente_key;
      await API.Entregas.marcarPendiente(id);
      toast('Paquete devuelto a pendiente.', 'success');
      await loadGlobalStats();
      await searchClients();
      if (clientKey && state.clients.some((client) => client.cliente_key === clientKey)) {
        await selectClient(clientKey);
      }
    } catch (error) {
      toast(error.message || 'No se pudo revertir el paquete.', 'error');
    }
  }

  function resetAll() {
    if (els.search) els.search.value = '';
    if (els.estado) els.estado.value = '';
    if (els.fecha) els.fecha.value = '';
    if (els.lote) els.lote.value = '';
    state.clients = [];
    state.selectedClient = null;
    state.packages = [];
    state.hasSearched = false;
    renderClients();
    renderPackages();
    els.search?.focus();
  }

  function exportCsv() {
    if (!state.packages.length) return;
    const headers = ['Cliente', 'Telefono', 'Codigo', 'Fecha ingreso', 'Ruta', 'Zona', 'Peso kg', 'Tamano calculado', 'Rango tamano', 'Tipo paquete Urbano', 'Piezas', 'Contenido', 'Estado entrega', 'Fecha entrega', 'Observacion'];
    const lines = state.packages.map((item) => [
      item.cliente || '',
      item.telefono || '',
      item.codigo_paquete || '',
      formatDate(item.fecha_ingreso, true),
      routeLabel(item),
      item.ruta?.zona || '',
      item.peso_kg ?? '',
      item.tamano_paquete?.label || '',
      item.tamano_paquete?.rango || '',
      item.tipo_paquete_urbano || '',
      item.piezas || '',
      item.contenido_paquete || '',
      item.estado_entrega || '',
      formatDate(item.fecha_entrega, true),
      item.observacion_entrega || ''
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));

    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `entregas_${(state.selectedClient?.nombre || 'cliente').replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function bindEvents() {
    els.searchBtn?.addEventListener('click', searchClients);
    els.search?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') searchClients();
    });
    els.clearSearch?.addEventListener('click', () => {
      if (els.search) els.search.value = '';
      els.search?.focus();
    });
    els.reset?.addEventListener('click', resetAll);
    els.exportBtn?.addEventListener('click', exportCsv);
    els.estado?.addEventListener('change', () => {
      if (state.hasSearched) searchClients();
    });
    els.fecha?.addEventListener('change', () => {
      if (state.hasSearched) searchClients();
    });
    els.lote?.addEventListener('change', () => {
      if (state.hasSearched) searchClients();
    });
    els.clientsList?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-client-key]');
      if (btn) selectClient(btn.dataset.clientKey);
    });
    els.profile?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'recoger') markPicked(btn.dataset.id);
      if (btn.dataset.action === 'pendiente') markPending(btn.dataset.id);
    });
    els.modalClose?.addEventListener('click', closeDeliveryModal);
    els.modalCancel?.addEventListener('click', closeDeliveryModal);
    els.modalConfirm?.addEventListener('click', confirmDelivery);
    els.modal?.addEventListener('click', (event) => {
      if (event.target === els.modal) closeDeliveryModal();
    });
    document.addEventListener('keydown', (event) => {
      if (!els.modal?.classList.contains('open')) return;
      if (event.key === 'Escape') { closeDeliveryModal(); return; }
      if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        confirmDelivery();
      }
    });
  }

  async function loadGlobalStats() {
    try {
      const response = await API.Entregas.resumen();
      setTopbarStats(response.data || {});
    } catch {
      if (els.topbarPending) els.topbarPending.textContent = '-';
      if (els.topbarDone) els.topbarDone.textContent = '-';
    }
  }

  function init() {
    bindEvents();
    loadRouteOptions();
    loadGlobalStats();
    if (els.userRol) {
      els.userRol.textContent = user.rol_label || user.rol || 'Encargado de Oficina';
    }
    renderClients();
    renderPackages();
  }

  init();
})();
