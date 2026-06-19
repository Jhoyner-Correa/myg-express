const LOOKUP_STORAGE_KEY = 'myg_consulta_rutas_state';
const LOOKUP_STATE_TTL_MS = 12 * 60 * 60 * 1000;

const RouteLookupState = {
  urbanoConnected: false,
  isConsulting: false,
  records: [],
  filteredRecords: [],
  routeResult: null,
  destinations: [],
  selectedRouteId: '',
  contratoFilter: ''
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!API.Auth.requirePermission('urbano.rutas.ver')) return;

  API.ensureSuperadminSidebar();
  bindEvents();
  initCustomDropdown();

  await Promise.all([loadRouteDestinations(), refreshSessionStatus()]);
  restoreLookupState();
  await restoreLatestCachedRoute();
  renderResults();
});

function bindEvents() {
  on('btn-consultar-ruta', 'click', consultRoute);
  on('btn-exportar-ruta', 'click', exportResultsToExcel);
  on('btn-enviar-a-ruta', 'click', sendVisibleRecordsToRoute);
  on('select-localidad-filter', 'change', applyFilters);
  on('select-result-sort', 'change', applyFilters);

  const contratoTrigger = byId('cr-contrato-filter-trigger');
  if (contratoTrigger) {
    contratoTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleContratoDropdown();
    });
  }

  document.addEventListener('click', (e) => {
    const th = byId('cr-th-contrato');
    if (th && !th.contains(e.target)) closeContratoDropdown();
  });

  byId('input-route-id')?.addEventListener('input', (event) => {
    event.target.value = normalizeRouteId(event.target.value);
    saveLookupState();
  });

  byId('input-route-id')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !byId('btn-consultar-ruta')?.disabled) {
      consultRoute();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeDropdown();
    closeContratoDropdown();
  });
}

function initCustomDropdown() {
  const trigger   = byId('cr-dropdown-trigger');
  const panel     = byId('cr-dropdown-panel');
  const searchInp = byId('cr-dd-search-input');
  if (!trigger || !panel) return;

  trigger.addEventListener('click', () => {
    if (trigger.disabled) return;
    panel.classList.contains('open') ? closeDropdown() : openDropdown();
  });

  searchInp?.addEventListener('input', () => renderDropdownList(searchInp.value.trim()));

  document.addEventListener('click', e => {
    const wrapper = byId('cr-dropdown-destino');
    if (wrapper && !wrapper.contains(e.target)) closeDropdown();
  });
}

function openDropdown() {
  const trigger   = byId('cr-dropdown-trigger');
  const panel     = byId('cr-dropdown-panel');
  const searchInp = byId('cr-dd-search-input');

  trigger?.classList.add('open');
  panel?.classList.add('open');
  trigger?.setAttribute('aria-expanded', 'true');

  if (searchInp) {
    searchInp.value = '';
    renderDropdownList('');
    setTimeout(() => searchInp.focus(), 60);
  }
}

function closeDropdown() {
  byId('cr-dropdown-trigger')?.classList.remove('open');
  byId('cr-dropdown-panel')?.classList.remove('open');
  byId('cr-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
}

/* ── Contrato column filter dropdown ── */
function toggleContratoDropdown() {
  byId('cr-contrato-dropdown')?.classList.toggle('open');
}

function closeContratoDropdown() {
  byId('cr-contrato-dropdown')?.classList.remove('open');
}

function contratoFilterUpdateUI(value) {
  const trigger = byId('cr-contrato-filter-trigger');
  const options = document.querySelectorAll('.cr-contrato-option');
  options.forEach(opt => opt.classList.toggle('active', opt.dataset.value === value));
  trigger?.classList.toggle('active', value !== '');
}

function setContratoFilter(value) {
  RouteLookupState.contratoFilter = value;
  contratoFilterUpdateUI(value);
  closeContratoDropdown();
  applyFilters();
}

(function initContratoOptions() {
  document.addEventListener('click', (e) => {
    const option = e.target.closest('.cr-contrato-option');
    if (option) {
      e.stopPropagation();
      setContratoFilter(option.dataset.value);
    }
  });
})();

function renderDropdownList(query = '') {
  const list = byId('cr-dd-list');
  if (!list) return;

  const q = normalizeText(query);
  const filtered = RouteLookupState.destinations.filter(r => {
    if (!q) return true;
    return normalizeText(buildDestinationSearchText(r)).includes(q);
  });

  if (!filtered.length) {
    list.innerHTML = `
      <div class="cr-dd-empty">
        <svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#9aada3;fill:none;stroke-width:1.5;margin-bottom:6px;display:block;margin-left:auto;margin-right:auto;"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        Sin resultados para <strong>${escHtml(query)}</strong>
      </div>`;
    return;
  }

  /* Agrupar por origen */
  const groups = {};
  filtered.forEach(r => {
    const key = sanitize(r.origen || 'Otro');
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });

  const orderMap = { 'Temu': 0, 'Urbano': 1 };
  const sortedGroups = Object.entries(groups).sort(([a], [b]) =>
    (orderMap[a] ?? 99) - (orderMap[b] ?? 99)
  );

  /* OpciÃ³n vacÃ­a solo cuando no hay bÃºsqueda activa */
  const blankHTML = !q ? `
    <div class="cr-dd-option placeholder-opt" data-value="" role="option">
      <svg style="width:12px;height:12px;stroke:#9aada3;fill:none;stroke-width:2;flex-shrink:0" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span class="cr-dd-name">Sin selección</span>
    </div>` : '';

  const groupsHTML = sortedGroups.map(([origen, rutas]) => {
    const chipClass = getChipClass(origen);
    const header = `
      <div class="cr-dd-group-header">
        <span class="cr-dd-chip ${chipClass}">${escHtml(origen)}</span>
        <span class="cr-dd-group-count">${rutas.length} lote${rutas.length !== 1 ? 's' : ''}</span>
      </div>`;

    const items = rutas.map(r => {
      const isSelected = String(r.id) === String(RouteLookupState.selectedRouteId);
      const rawNombre  = r.nombre_lote || `Ruta ${r.id}`;
      const { label: nombreParsed } = formatRouteNameWithDate(rawNombre);
      
      const rawOrigen = String(r.origen || '').trim();
      const cleanOrigen = (rawOrigen && rawOrigen !== '-' && rawOrigen.toLowerCase() !== 'otro') ? rawOrigen : '';
      const zonaClean = sanitize(r.zona || nombreParsed);
      const paquetes = r.total_avisos != null ? Number(r.total_avisos) : (r.total_registros != null ? Number(r.total_registros) : 0);
      const estadoClean = String(r.estado || 'pendiente').toLowerCase();
      
      let estadoLabel = 'Borrador';
      let statusDotColor = '#94a3b8'; // default slate grey
      if (estadoClean === 'pendiente' || estadoClean === 'borrador') {
        estadoLabel = 'Borrador';
        statusDotColor = '#f59e0b'; // amber
      } else if (estadoClean === 'procesando') {
        estadoLabel = 'Procesando';
        statusDotColor = '#3b82f6'; // blue
      }

      const metaParts = [`MYG-${r.id}`];
      if (cleanOrigen) {
        metaParts.push(`Origen: ${cleanOrigen}`);
      }
      metaParts.push(`${paquetes} paq.`);
      const metaText = metaParts.join(' Â· ');

      return `
        <div class="cr-dd-option${isSelected ? ' selected' : ''}" data-value="${r.id}" role="option" aria-selected="${isSelected}">
          <div class="cr-dd-icon-box">
            <svg viewBox="0 0 24 24" class="cr-dd-map-icon"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <span class="cr-dd-text">
            <span class="cr-dd-name">${escHtml(zonaClean)}</span>
            <span class="cr-dd-meta">${escHtml(metaText)}</span>
          </span>
          <div class="cr-dd-right-wrap">
            <span class="cr-dd-status-badge">
              <span class="status-dot" style="background-color: ${statusDotColor}"></span>
              ${estadoLabel}
            </span>
            <svg class="cr-dd-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>`;
    }).join('');

    return header + items;
  }).join('');

  list.innerHTML = blankHTML + groupsHTML;

  list.querySelectorAll('.cr-dd-option').forEach(opt => {
    opt.addEventListener('click', () => {
      selectDestination(opt.dataset.value || '');
      closeDropdown();
    });
  });
}

function selectDestination(value) {
  RouteLookupState.selectedRouteId = value;

  const hiddenSelect = byId('select-destino-ruta');
  if (hiddenSelect) hiddenSelect.value = value;

  const labelEl = byId('cr-dd-label-text');

  if (!value) {
    if (labelEl) {
      labelEl.innerHTML = 'Seleccionar ruta a destino¦';
      labelEl.classList.add('placeholder');
    }
  } else {
    const dest = RouteLookupState.destinations.find(r => String(r.id) === String(value));
    if (dest && labelEl) {
      const { label } = formatRouteNameWithDate(dest.nombre_lote || `Ruta ${dest.id}`);
      let zonaStr = sanitize(dest.zona || label);
      
      // Remove redundant "Ruta" prefix if present
      if (/^ruta\s+/i.test(zonaStr)) {
        zonaStr = zonaStr.replace(/^ruta\s*/i, '').trim();
      }
      
      const rawOrigen = String(dest.origen || '').trim();
      const origenStr = (rawOrigen && rawOrigen !== '-' && rawOrigen.toLowerCase() !== 'otro') ? rawOrigen : '';
      
      let badgeHtml = '';
      if (origenStr) {
        const chipClass = getChipClass(origenStr);
        badgeHtml = `<span class="cr-dd-chip ${chipClass}">${escHtml(origenStr)}</span>`;
      }
      
      labelEl.innerHTML = `
        <span class="cr-selected-wrapper">
          <span class="cr-selected-code">MYG-${dest.id}</span>
          <span class="cr-selected-name">Ruta ${escHtml(zonaStr)}</span>
          ${badgeHtml}
        </span>
      `;
      labelEl.classList.remove('placeholder');
    }
  }

  saveLookupState();
  updateActionButtons();
}

async function refreshSessionStatus() {
  try {
    const response = await API.ConsultaRutas.status();
    paintSessionStatus(response?.data || { connected: false });
  } catch {
    paintSessionStatus({ connected: false });
  }
}

function paintSessionStatus(status) {
  RouteLookupState.urbanoConnected = Boolean(status?.connected);
  const conn = RouteLookupState.urbanoConnected;

  const sessionDot  = byId('cr-session-dot');
  const routeInput  = byId('input-route-id');
  const consultBtn  = byId('btn-consultar-ruta');
  const localSelect  = byId('select-localidad-filter');
  const sortSelect   = byId('select-result-sort');
  const ddTrigger    = byId('cr-dropdown-trigger');
  const cardTitle    = byId('urbano-card-title');
  const cardDesc     = byId('urbano-card-desc');
  // Los controles quedan habilitados; el backend inicia sesion por sede al consultar.
  if (routeInput)  routeInput.disabled  = false;
  if (consultBtn)  consultBtn.disabled  = false;
  if (sortSelect)  sortSelect.disabled  = false;
  if (ddTrigger)   ddTrigger.disabled   = false;
  if (localSelect) localSelect.disabled = !hasLocalityOptions();

  if (conn) {
    sessionDot?.classList.add('active');
    if (cardTitle) cardTitle.textContent = 'Urbano listo para consultar';
    if (cardDesc) cardDesc.textContent = 'Sesion activa para esta sede.';
  } else {
    sessionDot?.classList.remove('active');
    if (cardTitle) cardTitle.textContent = 'Urbano por sede configurado';
    if (cardDesc) cardDesc.textContent = 'La conexion se iniciara automaticamente al consultar una ruta.';
  }
}
async function loadRouteDestinations() {
  const ddTrigger = byId('cr-dropdown-trigger');
  const labelEl   = byId('cr-dd-label-text');

  try {
    const response = await API.Rutas.listar();
    const rawDestinations = Array.isArray(response?.data) ? response.data : [];

    // Obtener la fecha de hoy en formato YYYY-MM-DD
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;

    // Filtrar: Solo de hoy y que no estÃ©n completadas o canceladas (no finalizadas)
    RouteLookupState.destinations = rawDestinations.filter(route => {
      const isToday = String(route.fecha || '').startsWith(todayStr);
      const isFinalized = route.estado === 'completado' || route.estado === 'cancelado';
      return isToday && !isFinalized;
    });

    if (!RouteLookupState.destinations.length) {
      if (labelEl) { labelEl.textContent = 'Sin lotes activos hoy'; labelEl.classList.add('placeholder'); }
      if (ddTrigger) ddTrigger.disabled = true;
      return;
    }

    const hiddenSelect = byId('select-destino-ruta');
    if (hiddenSelect) {
      hiddenSelect.innerHTML = `<option value="">â€”</option>` +
        RouteLookupState.destinations.map(r =>
          `<option value="${r.id}">${escHtml(r.nombre_lote || `Ruta ${r.id}`)}</option>`
        ).join('');
    }

    if (labelEl) { labelEl.textContent = 'Seleccionar lote destinoâ€¦'; labelEl.classList.remove('placeholder'); }
    renderDropdownList('');
  } catch {
    if (labelEl) { labelEl.textContent = 'Error al cargar lotes'; labelEl.classList.add('placeholder'); }
    if (ddTrigger) ddTrigger.disabled = true;
  }
}

async function consultRoute() {
  const routeIdInput = byId('input-route-id');
  const routeId = String(routeIdInput?.value || '').trim();
  if (!routeId || !isValidRouteId(routeId)) {
    SharedUI.showToast('Ingresa un nÃºmero de ruta vÃ¡lido.', 'error', { title: 'Ruta invÃ¡lida' });
    routeIdInput?.focus();
    return;
  }

  SharedUI.setButtonLoading('btn-consultar-ruta', true, 'Consultando...');
  showSkeleton(true);
  resetResults({ keepFilters: true, render: false });

  // Reset de ordenamiento y localidad a valores por defecto para la nueva consulta
  const sortSelect = byId('select-result-sort');
  if (sortSelect) sortSelect.value = 'default';
  const localitySelect = byId('select-localidad-filter');
  if (localitySelect) {
    localitySelect.value = '';
  }


  try {
    const response = await API.ConsultaRutas.consultarRuta(routeId);
    const result   = response?.data || {};

    RouteLookupState.routeResult = result;
    RouteLookupState.records     = Array.isArray(result.records) ? result.records : [];

    SharedUI.setText('stat-route-id',         sanitize(result.routeId || routeId || '-'));
    SharedUI.setText('stat-total-guias',       String(result.totalGuias      ?? RouteLookupState.records.length ?? 0));
    SharedUI.setText('stat-total-registros',   String(result.totalRegistros  ?? RouteLookupState.records.length ?? 0));
    SharedUI.setText('stat-total-localidades', String(getLocalityCount(RouteLookupState.records)));

    updateLocalityFilter(RouteLookupState.records);
    applyFilters();

    const total = result.totalRegistros ?? RouteLookupState.records.length ?? 0;
    SharedUI.showToast(`${total} registros encontrados.`, 'success', { title: 'Consulta completada' });
    saveLookupState();
  } catch (error) {
    const msg = getErrorMessage(error, 'No se pudo consultar la ruta.');
    if (normalizeText(msg).includes('sesion de urbano')) paintSessionStatus({ connected: false });
    SharedUI.showToast(msg, 'error', { title: 'Error de consulta' });
    showSkeleton(false);
  } finally {
    SharedUI.setButtonLoading('btn-consultar-ruta', false, 'Consultar ruta');
  }
}

function applyFilters() {
  const locality = normalizeText(byId('select-localidad-filter')?.value || '');
  const contrato = RouteLookupState.contratoFilter;
  const sort     = byId('select-result-sort')?.value || 'default';

  RouteLookupState.filteredRecords = [...RouteLookupState.records].filter(item => {
    if (locality && normalizeText(item.localidad || '') !== locality) return false;
    if (contrato === 'temu' && !(item.contrato || '').toLowerCase().includes('temu')) return false;
    if (contrato === 'no-temu' && (item.contrato || '').toLowerCase().includes('temu')) return false;
    return true;
  });
  RouteLookupState.filteredRecords.sort((a, b) => compareRecords(a, b, sort));
  renderResults();
  saveLookupState();
}

function renderResults() {
  showSkeleton(false);
  renderPreviewTable();
  updateResultsMeta();
  updateActionButtons();
}

async function restoreLatestCachedRoute() {
  try {
    const response = await API.ConsultaRutas.obtenerUltimaConsulta();
    const data = response?.data;
    if (data && data.routeId && data.result) {
      const routeId = data.routeId;
      const records = Array.isArray(data.result.records) ? data.result.records : [];

      const input = byId('input-route-id');
      if (input) {
        input.value = normalizeRouteId(routeId);
      }

      RouteLookupState.routeResult = data.result;
      RouteLookupState.records = records;

      SharedUI.setText('stat-route-id', sanitize(routeId || '-'));
      SharedUI.setText('stat-total-guias', String(data.totalGuias ?? records.length ?? 0));
      SharedUI.setText('stat-total-registros', String(data.totalRegistros ?? records.length ?? 0));
      SharedUI.setText('stat-total-localidades', String(getLocalityCount(records)));

      updateLocalityFilter(records);

      const stored = getStoredLookupState();
      if (stored && stored.queriedRouteId === routeId) {
        const localitySelect = byId('select-localidad-filter');
        if (localitySelect && stored.selectedLocalidad) {
          localitySelect.value = stored.selectedLocalidad;
        }
        if (stored.selectedContrato) {
          RouteLookupState.contratoFilter = stored.selectedContrato;
          contratoFilterUpdateUI(stored.selectedContrato);
        }

        const sortSelect = byId('select-result-sort');
        if (sortSelect && stored.selectedSort) {
          sortSelect.value = stored.selectedSort;
        }
      }

      applyFilters();
    }
  } catch (error) {
    console.error('Error al recuperar cache de ultima consulta:', error);
  }
}

function renderPreviewTable() {
  const tbody = byId('preview-rutas-body');
  const emptyEl = byId('results-empty-state');
  const tableEl = byId('cr-preview-table');
  const footerEl = byId('cr-table-footer');
  if (!tbody) return;

  const hasRows = RouteLookupState.filteredRecords.length > 0;
  if (emptyEl) emptyEl.style.display = hasRows ? 'none' : 'flex';
  if (tableEl) tableEl.style.display = hasRows ? 'table' : 'none';
  if (footerEl) footerEl.style.display = hasRows ? 'flex' : 'none';

  tbody.innerHTML = hasRows
    ? RouteLookupState.filteredRecords.map(renderRow).join('')
    : '';
}

function renderRow(item) {
  return `
    <tr>
      <td class="mono-cell">${escHtml(sanitize(item.routeId || '-'))}</td>
      <td class="mono-cell">${escHtml(formatGuide(item.guia))}</td>
      <td class="mono-cell">${escHtml(sanitize(item.rastreo || '-'))}</td>
      <td><div class="client-cell"><span class="client-name">${escHtml(sanitize(item.cliente || '-'))}</span></div></td>
      <td>${escHtml(formatPhone(item.telefono))}</td>
      <td>${escHtml(sanitize(item.contrato || '-'))}</td>
      <td><span class="location-badge">${escHtml(formatLocalidad(item.localidad))}</span></td>
    </tr>`;
}

function updateResultsMeta() {
  const count = RouteLookupState.filteredRecords.length;
  const total = RouteLookupState.records.length;
  const routeId = sanitize(RouteLookupState.routeResult?.routeId || '-');
  const sub = total
    ? `${count} registro${count !== 1 ? 's' : ''}`
    : 'Ingresa un numero de ruta para visualizar los registros.';

  SharedUI.setText('result-status-sub', sub);
  SharedUI.setText('results-range', buildRangeLabel(count));
}

function buildRangeLabel(count) {
  if (!count) return 'Sin registros.';
  return `${count} registro${count === 1 ? '' : 's'}.`;
}

function updateActionButtons() {
  const hasResults = RouteLookupState.filteredRecords.length > 0;
  const canSend = hasResults && Boolean(RouteLookupState.selectedRouteId);

  setDisabled('btn-exportar-ruta', !hasResults);
  setDisabled('btn-enviar-a-ruta', !canSend);
}

function updateLocalityFilter(records) {
  const select = byId('select-localidad-filter');
  if (!select) return;

  const previousValue = select.value || '';
  const localities = Array.from(new Set(
    records.map((item) => sanitize(item.localidad || '')).filter((value) => value !== '-')
  )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  select.innerHTML = '<option value="">Todas las localidades</option>' + localities
    .map((value) => `<option value="${escHtml(value)}">${escHtml(value)}</option>`)
    .join('');

  select.value = localities.includes(previousValue) ? previousValue : '';
  select.disabled = localities.length <= 1;
}

function showSkeleton(show) {
  const skeleton = byId('cr-skeleton');
  const emptyEl = byId('results-empty-state');
  const tableEl = byId('cr-preview-table');
  const footerEl = byId('cr-table-footer');

  if (skeleton) skeleton.style.display = show ? 'block' : 'none';
  if (emptyEl) emptyEl.style.display = show ? 'none' : 'flex';
  if (tableEl) tableEl.style.display = show ? 'none' : tableEl.style.display;
  if (footerEl && show) footerEl.style.display = 'none';
}

function resetResults({ keepFilters = false, render = true } = {}) {
  RouteLookupState.records = [];
  RouteLookupState.filteredRecords = [];
  RouteLookupState.routeResult = null;

  SharedUI.setText('stat-route-id', '-');
  SharedUI.setText('stat-total-guias', '0');
  SharedUI.setText('stat-total-registros', '0');
  SharedUI.setText('stat-total-localidades', '0');

  updateLocalityFilter([]);
  if (!keepFilters) {
    selectDestination('');
    const sortSelect = byId('select-result-sort');
    if (sortSelect) sortSelect.value = 'default';
  }
  if (render) renderResults();
}

async function sendVisibleRecordsToRoute() {
  if (!RouteLookupState.selectedRouteId) {
    SharedUI.showToast('Selecciona una ruta destino.', 'error', { title: 'Ruta requerida' });
    return;
  }
  if (!RouteLookupState.filteredRecords.length) {
    SharedUI.showToast('No hay registros disponibles para enviar.', 'error', { title: 'Sin registros' });
    return;
  }

  const destination = RouteLookupState.destinations.find((route) => String(route.id) === String(RouteLookupState.selectedRouteId));
  const destinationName = destination ? sanitize(destination.nombre_lote || `Ruta ${destination.id}`) : '-';
  const count = RouteLookupState.filteredRecords.length;

  const confirmed = await SharedUI.confirm({
    title: 'Confirmar envio a la ruta',
    message: `Se importaran ${count} registros a la ruta "${destinationName}".`,
    confirmText: 'Importar registros',
    type: 'success'
  });
  if (!confirmed) return;

  const avisos = RouteLookupState.filteredRecords
    .map((item) => ({
      nombre: sanitize(item.cliente || ''),
      telefono: normalizePhone(item.telefono),
      codigo_paquete: sanitize(item.guia || ''),
      peso_kg: normalizeWeight(item.peso_kg ?? item.peso),
      tipo_paquete_urbano: sanitizeOptional(item.tipo_paquete_urbano || item.tipo_paquete),
      piezas: normalizeInteger(item.piezas),
      contenido_paquete: sanitizeOptional(item.contenido_paquete || item.guia_contenido),
      empresa_origen: 'Urbano',
      mensaje: null
    }))
    .filter((item) => item.telefono.length >= 8);

  if (!avisos.length) {
    SharedUI.showToast('Los registros no contienen telefonos validos.', 'error', { title: 'Validacion de datos' });
    return;
  }

  SharedUI.setButtonLoading('btn-enviar-a-ruta', true, 'Importando...');
  try {
    const response = await API.Avisos.importar({
      lote_id: Number(RouteLookupState.selectedRouteId),
      avisos
    });
    SharedUI.showToast('Registros importados a la ruta correctamente.', 'success', { title: 'Importacion completada' });
  } catch (error) {
    SharedUI.showToast(getErrorMessage(error, 'No se pudo importar a la ruta.'), 'error', { title: 'Error de importacion' });
  } finally {
    SharedUI.setButtonLoading('btn-enviar-a-ruta', false, 'Enviar a ruta');
  }
}

function exportResultsToExcel() {
  if (!RouteLookupState.filteredRecords.length) {
    SharedUI.showToast('No hay datos para exportar.', 'info', { title: 'Sin datos' });
    return;
  }
  if (!window.XLSX) {
    SharedUI.showToast('No se cargo el modulo de exportacion XLSX.', 'error', { title: 'Exportacion no disponible' });
    return;
  }

  const routeId = sanitize(RouteLookupState.routeResult?.routeId || 'ruta');
  const worksheet = window.XLSX.utils.json_to_sheet(RouteLookupState.filteredRecords.map((item) => ({
    'Ruta ID': sanitize(item.routeId),
    Guia: formatGuide(item.guia),
    Rastreo: sanitize(item.rastreo),
    Cliente: sanitize(item.cliente),
    Telefono: formatPhone(item.telefono),
    Contrato: sanitize(item.contrato),
    Localidad: sanitize(item.localidad)
  })));

  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Ruta');
  window.XLSX.writeFile(workbook, `ruta_${routeId}.xlsx`);
  SharedUI.showToast('Archivo Excel descargado correctamente.', 'success', { title: 'Exportacion completada' });
}

function saveLookupState() {
  try {
    const state = {
      savedAt: Date.now(),
      queriedRouteId: byId('input-route-id')?.value || '',
      selectedDestinationId: RouteLookupState.selectedRouteId,
      selectedLocalidad: byId('select-localidad-filter')?.value || '',
      selectedContrato: RouteLookupState.contratoFilter,
      selectedSort: byId('select-result-sort')?.value || 'default'
    };
    localStorage.setItem(LOOKUP_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage can fail in private mode or when quota is exceeded.
  }
}

function restoreLookupState() {
  try {
    const raw = localStorage.getItem(LOOKUP_STORAGE_KEY);
    if (!raw) return;

    const state = JSON.parse(raw);
    if (!state?.savedAt || Date.now() - state.savedAt > LOOKUP_STATE_TTL_MS) {
      localStorage.removeItem(LOOKUP_STORAGE_KEY);
      return;
    }

    const input = byId('input-route-id');
    if (input && state.queriedRouteId) input.value = normalizeRouteId(state.queriedRouteId);

    if (state.selectedContrato) {
      RouteLookupState.contratoFilter = state.selectedContrato;
      contratoFilterUpdateUI(state.selectedContrato);
    }

    const sortSelect = byId('select-result-sort');
    if (sortSelect && state.selectedSort) sortSelect.value = state.selectedSort;

    if (state.selectedDestinationId) selectDestination(state.selectedDestinationId);
  } catch {
    localStorage.removeItem(LOOKUP_STORAGE_KEY);
  }
}

function getStoredLookupState() {
  try {
    const raw = localStorage.getItem(LOOKUP_STORAGE_KEY);
    if (!raw) return null;

    const state = JSON.parse(raw);
    if (!state?.savedAt || Date.now() - state.savedAt > LOOKUP_STATE_TTL_MS) {
      localStorage.removeItem(LOOKUP_STORAGE_KEY);
      return null;
    }

    return state;
  } catch {
    localStorage.removeItem(LOOKUP_STORAGE_KEY);
    return null;
  }
}

function applyStoredUiState() {
  const state = getStoredLookupState();
  if (!state) return;

  const localitySelect = byId('select-localidad-filter');
  if (localitySelect && state.selectedLocalidad) {
    localitySelect.value = state.selectedLocalidad;
  }

  const sortSelect = byId('select-result-sort');
  if (sortSelect && state.selectedSort) {
    sortSelect.value = state.selectedSort;
  }

  if (state.selectedDestinationId) {
    selectDestination(state.selectedDestinationId);
  }

  applyFilters({ persist: false });
}

function compareRecords(a, b, sort) {
  if (sort === 'default') return 0;
  const [field, direction] = sort.split('-');
  const valueA = normalizeText(a[field] || '');
  const valueB = normalizeText(b[field] || '');
  if (valueA === valueB) return 0;
  return (valueA > valueB ? 1 : -1) * (direction === 'desc' ? -1 : 1);
}

function getLocalityCount(records) {
  return new Set(records.map((item) => sanitize(item.localidad || '')).filter((value) => value !== '-')).size;
}

function hasLocalityOptions() {
  return (byId('select-localidad-filter')?.options?.length || 0) > 1;
}

function cleanRouteName(name) {
  const value = sanitize(name);
  return value.replace(/^Ruta\s*\d+\s*[-.]\s*/i, '').trim() || value;
}

function formatRouteNameWithDate(name) {
  const value = sanitize(name);
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{2}:\d{2})?/);
  if (!match) return { label: cleanRouteName(value), dateStr: null };

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const label = cleanRouteName(value.replace(/\s*\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{2}:\d{2})?/, ''));
  return {
    label: label === '-' ? 'Ruta' : label,
    dateStr: Number.isNaN(date.getTime())
      ? null
      : date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
  };
}

function buildDestinationSearchText(route) {
  return `${route.id} MYG-${route.id} ${route.nombre_lote || ''} ${route.origen || ''} ${route.zona || ''}`;
}

function buildDestinationMeta(route) {
  const parts = [];
  if (route.zona) parts.push(route.zona);
  if (route.total_avisos != null) parts.push(`${route.total_avisos} destinatario${Number(route.total_avisos) !== 1 ? 's' : ''}`);
  else if (route.total_registros != null) parts.push(`${route.total_registros} registros`);
  if (route.fecha) {
    const date = new Date(route.fecha);
    if (!Number.isNaN(date.getTime())) {
      parts.push(date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }));
    }
  }
  return parts.join(' - ');
}

function getChipClass(origin = '') {
  const value = normalizeText(origin);
  if (value.includes('temu')) return 'temu';
  if (value.includes('urbano')) return 'urbano';
  if (value.includes('mgg') || value.includes('myg') || value.includes('my g')) return 'mgg';
  return '';
}

function isUrbanoSessionProblem(message) {
  const text = normalizeText(message);
  return text.includes('urbano') && (
    text.includes('sesion') ||
    text.includes('conectar') ||
    text.includes('credencial') ||
    text.includes('autentic')
  );
}

function getErrorMessage(error, fallback) {
  return String(error?.message || fallback || 'Ocurrio un error inesperado.');
}

function normalizeRouteId(value) {
  return String(value || '').replace(/\D+/g, '').slice(0, 20);
}

function isValidRouteId(value) {
  return /^\d{1,20}$/.test(String(value || ''));
}

function normalizePhone(value) {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeWeight(value) {
  const raw = String(value ?? '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
    .trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(3)) : null;
}

function normalizeInteger(value) {
  const parsed = Number(String(value ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function sanitize(value) {
  return String(value ?? '').trim() || '-';
}

function sanitizeOptional(value) {
  const clean = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean || null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatGuide(value) {
  const text = sanitize(value);
  return text === '-' ? text : text.toUpperCase();
}

function formatLocalidad(value) {
  const text = sanitize(value);
  if (text === '-') return text;
  return text.replace(/\s*\([^)]*\)\s*/g, '').trim() || '-';
}

function formatPhone(value) {
  const raw = normalizePhone(value);
  if (!raw) return '-';
  return raw.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}


function setDisabled(id, disabled) {
  const element = byId(id);
  if (element) element.disabled = Boolean(disabled);
}

function on(id, eventName, handler) {
  byId(id)?.addEventListener(eventName, handler);
}

function byId(id) {
  return document.getElementById(id);
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
