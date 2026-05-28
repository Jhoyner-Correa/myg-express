/* consulta-rutas.js  v3 — custom dropdown con agrupación + nombres parseados */

const RouteLookupState = {
  urbanoConnected: false,
  records: [],
  filteredRecords: [],
  routeResult: null,
  destinations: [],
  selectedRouteId: ''
};

const MAX_PREVIEW_ROWS = 6;

/* ══ INIT ══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  API.Auth.requireAuth();
  API.ensureSuperadminSidebar();
  hydrateShell(API.getUser());
  bindEvents();
  initCustomDropdown();
  await Promise.all([loadRouteDestinations(), refreshSessionStatus()]);
  renderResults();
});

/* ── Shell ─────────────────────────────────────────────── */
function hydrateShell(user) {
  SharedUI.setText('user-nombre', user?.nombre || '—');
  SharedUI.setText('user-sede',   user?.sede_nombre || '—');
  SharedUI.setText('user-rol',    user?.rol || '—');
  SharedUI.setText('user-avatar', (user?.nombre || 'U').charAt(0).toUpperCase());
  document.getElementById('btn-logout')?.addEventListener('click', () => API.Auth.logout());
}

/* ── Events ─────────────────────────────────────────────── */
function bindEvents() {
  document.getElementById('btn-connect-urbano')?.addEventListener('click', connectUrbano);
  document.getElementById('btn-consultar-ruta')?.addEventListener('click', consultRoute);
  document.getElementById('btn-exportar-ruta')?.addEventListener('click', exportResultsToExcel);
  document.getElementById('btn-enviar-a-ruta')?.addEventListener('click', openConfirmSend);
  document.getElementById('select-localidad-filter')?.addEventListener('change', applyFilters);
  document.getElementById('select-result-sort')?.addEventListener('change', applyFilters);
  document.getElementById('btn-open-results-modal')?.addEventListener('click', () => toggleModal('results-modal', true));
  document.getElementById('btn-close-results-modal')?.addEventListener('click', () => toggleModal('results-modal', false));
  document.getElementById('btn-close-results-modal-footer')?.addEventListener('click', () => toggleModal('results-modal', false));
  document.getElementById('results-modal')?.addEventListener('click', e => { if (e.target.id === 'results-modal') toggleModal('results-modal', false); });
  document.getElementById('btn-cancel-send')?.addEventListener('click', () => toggleModal('confirm-send-modal', false));
  document.getElementById('btn-confirm-send')?.addEventListener('click', confirmSend);
  document.getElementById('confirm-send-modal')?.addEventListener('click', e => { if (e.target.id === 'confirm-send-modal') toggleModal('confirm-send-modal', false); });
  document.getElementById('input-route-id')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !document.getElementById('btn-consultar-ruta')?.disabled) consultRoute();
  });
}

function toggleModal(id, open) {
  document.getElementById(id)?.classList.toggle('open', open);
}

/* ══ CUSTOM DROPDOWN ═══════════════════════════════════ */
function initCustomDropdown() {
  const trigger   = document.getElementById('cr-dropdown-trigger');
  const panel     = document.getElementById('cr-dropdown-panel');
  const searchInp = document.getElementById('cr-dd-search-input');
  if (!trigger || !panel) return;

  trigger.addEventListener('click', () => {
    if (trigger.disabled) return;
    panel.classList.contains('open') ? closeDropdown() : openDropdown();
  });

  searchInp?.addEventListener('input', () => renderDropdownList(searchInp.value.trim()));

  document.addEventListener('click', e => {
    const wrapper = document.getElementById('cr-dropdown-destino');
    if (wrapper && !wrapper.contains(e.target)) closeDropdown();
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDropdown(); });
}

function openDropdown() {
  const trigger   = document.getElementById('cr-dropdown-trigger');
  const panel     = document.getElementById('cr-dropdown-panel');
  const searchInp = document.getElementById('cr-dd-search-input');

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
  document.getElementById('cr-dropdown-trigger')?.classList.remove('open');
  document.getElementById('cr-dropdown-panel')?.classList.remove('open');
  document.getElementById('cr-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
}

/**
 * Renderiza el dropdown agrupando por origen y mostrando nombres limpios
 */
function renderDropdownList(query = '') {
  const list = document.getElementById('cr-dd-list');
  if (!list) return;

  const q = normalizeText(query);
  const filtered = RouteLookupState.destinations.filter(r => {
    if (!q) return true;
    return normalizeText(buildDestSearchText(r)).includes(q);
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

  /* Opción vacía solo cuando no hay búsqueda activa */
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
      const { label: nombreParsed, dateStr } = formatLoteNameWithDate(rawNombre);
      const meta = buildDestMeta(r);
      const metaFinal = dateStr ? [dateStr, meta].filter(Boolean).join(' · ') : meta;

      return `
        <div class="cr-dd-option${isSelected ? ' selected' : ''}" data-value="${r.id}" role="option" aria-selected="${isSelected}">
          <span class="cr-dd-badge">#${r.id}</span>
          <span class="cr-dd-text">
            <span class="cr-dd-name">${escHtml(nombreParsed)}</span>
            ${metaFinal ? `<span class="cr-dd-meta">${escHtml(metaFinal)}</span>` : ''}
          </span>
          <svg class="cr-dd-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
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

  const hiddenSelect = document.getElementById('select-destino-ruta');
  if (hiddenSelect) hiddenSelect.value = value;

  const labelEl = document.getElementById('cr-dd-label-text');

  if (!value) {
    if (labelEl) { labelEl.textContent = 'Seleccionar lote destino…'; labelEl.classList.add('placeholder'); }
  } else {
    const dest = RouteLookupState.destinations.find(r => String(r.id) === String(value));
    if (dest && labelEl) {
      const { label } = formatLoteNameWithDate(dest.nombre_lote || `Ruta ${dest.id}`);
      const origen = sanitize(dest.origen || '');
      labelEl.textContent = `#${dest.id} · ${label}${origen ? ' · ' + origen : ''}`;
      labelEl.classList.remove('placeholder');
    }
  }

  updateActionButtons();
}

/* ── Helpers de nombre ─────────────────────────────────── */
function cleanLoteName(nombre) {
  if (!nombre) return 'Sin nombre';
  return nombre.replace(/^Ruta\s*\d+\s*[-·]\s*/i, '').trim() || nombre;
}

function formatLoteNameWithDate(nombre) {
  if (!nombre) return { label: 'Sin nombre', dateStr: null };
  const dateMatch = nombre.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{2}:\d{2})?/);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    const formatted = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
    const baseName = nombre.replace(/\s*\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{2}:\d{2})?/, '').trim();
    return { label: baseName || 'Lote', dateStr: formatted };
  }
  return { label: cleanLoteName(nombre), dateStr: null };
}

function buildDestSearchText(r) {
  return `${r.id} ${r.nombre_lote || ''} ${r.origen || ''} ${r.zona || ''}`;
}

function buildDestMeta(r) {
  const parts = [];
  if (r.zona) parts.push(r.zona);
  if (r.total_avisos != null) parts.push(`${r.total_avisos} destinatario${r.total_avisos !== 1 ? 's' : ''}`);
  else if (r.total_registros != null) parts.push(`${r.total_registros} registros`);
  if (r.fecha) {
    try {
      const d = new Date(r.fecha);
      if (!isNaN(d.getTime())) {
        parts.push(d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }));
      }
    } catch (_) { /* ignorar */ }
  }
  return parts.join(' · ');
}

function getChipClass(origen = '') {
  const o = normalizeText(origen);
  if (o.includes('temu'))   return 'temu';
  if (o.includes('urbano')) return 'urbano';
  if (o.includes('mgg') || o.includes('myg') || o.includes('my g')) return 'mgg';
  return '';
}

/* ══ SESSION ═══════════════════════════════════════════ */
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

  const connectBtn  = document.getElementById('btn-connect-urbano');
  const sessionDot  = document.getElementById('cr-session-dot');
  const routeInput  = document.getElementById('input-route-id');
  const consultBtn  = document.getElementById('btn-consultar-ruta');
  const localSelect = document.getElementById('select-localidad-filter');
  const sortSelect  = document.getElementById('select-result-sort');
  const ddTrigger   = document.getElementById('cr-dropdown-trigger');
  const cardTitle   = document.getElementById('urbano-card-title');
  const cardDesc    = document.getElementById('urbano-card-desc');

  if (conn) {
    sessionDot?.classList.add('active');
    if (connectBtn) {
      connectBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><polyline points="20 6 9 17 4 12"/></svg> Sesión activa`;
      connectBtn.disabled = true;
      connectBtn.classList.add('connected');
    }
    if (cardTitle) cardTitle.textContent = 'Conectado con Urbano';
    if (cardDesc)  cardDesc.textContent  = 'Sesión activa — consulta disponible.';
    if (routeInput)  routeInput.disabled  = false;
    if (consultBtn)  consultBtn.disabled  = false;
    if (localSelect) localSelect.disabled = !hasLocalityOptions();
    if (sortSelect)  sortSelect.disabled  = false;
    if (ddTrigger)   ddTrigger.disabled   = false;
    setStatus('Sesión activa. Ya puedes consultar una ruta.', 'success');
  } else {
    sessionDot?.classList.remove('active');
    if (connectBtn) {
      connectBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Iniciar sesión`;
      connectBtn.disabled = false;
      connectBtn.classList.remove('connected');
    }
    if (cardTitle) cardTitle.textContent = 'Conecta con Urbano para comenzar';
    if (cardDesc)  cardDesc.textContent  = 'Inicia sesión para habilitar la consulta.';
    if (routeInput)  routeInput.disabled  = true;
    if (consultBtn)  consultBtn.disabled  = true;
    if (localSelect) localSelect.disabled = true;
    if (sortSelect)  sortSelect.disabled  = true;
    if (ddTrigger)   ddTrigger.disabled   = true;
    setStatus('Inicia sesión en Urbano para consultar rutas.', 'idle');
  }
}

async function connectUrbano() {
  const btn = document.getElementById('btn-connect-urbano');
  SharedUI.setButtonLoading(btn, true, 'Conectando…');
  setStatus('Solicitando sesión en Urbano…', 'info');
  try {
    const response = await API.ConsultaRutas.login();
    paintSessionStatus(response?.data || { connected: true });
    SharedUI.showToast('Sesión iniciada correctamente.', 'success', { title: 'Conectado' });
  } catch (error) {
    const msg = error?.message || 'No se pudo iniciar sesión con Urbano.';
    paintSessionStatus({ connected: false });
    setStatus(msg, 'error');
    SharedUI.showToast(msg, 'error', { title: 'Error de conexión' });
  } finally {
    if (!RouteLookupState.urbanoConnected) SharedUI.setButtonLoading(btn, false, 'Iniciar sesión');
  }
}

/* ══ DESTINATIONS ══════════════════════════════════════ */
async function loadRouteDestinations() {
  const ddTrigger = document.getElementById('cr-dropdown-trigger');
  const labelEl   = document.getElementById('cr-dd-label-text');

  try {
    const response = await API.Rutas.listar();
    RouteLookupState.destinations = Array.isArray(response?.data) ? response.data : [];

    if (!RouteLookupState.destinations.length) {
      if (labelEl) { labelEl.textContent = 'Sin lotes disponibles'; labelEl.classList.add('placeholder'); }
      if (ddTrigger) ddTrigger.disabled = true;
      return;
    }

    // Popula select oculto para compatibilidad
    const hiddenSelect = document.getElementById('select-destino-ruta');
    if (hiddenSelect) {
      hiddenSelect.innerHTML = `<option value="">—</option>` +
        RouteLookupState.destinations.map(r =>
          `<option value="${r.id}">${escHtml(r.nombre_lote || `Ruta ${r.id}`)}</option>`
        ).join('');
    }

    if (labelEl) { labelEl.textContent = 'Seleccionar lote destino…'; labelEl.classList.add('placeholder'); }

  } catch {
    if (labelEl) { labelEl.textContent = 'Error al cargar lotes'; labelEl.classList.add('placeholder'); }
    if (ddTrigger) ddTrigger.disabled = true;
  }
}

/* ══ QUERY ═════════════════════════════════════════════ */
async function consultRoute() {
  const routeId = String(document.getElementById('input-route-id')?.value || '').trim();
  if (!routeId) {
    setStatus('Ingresa un número de ruta válido.', 'error');
    document.getElementById('input-route-id')?.focus();
    return;
  }

  SharedUI.setButtonLoading('btn-consultar-ruta', true, 'Consultando…');
  setStatus(`Consultando ruta ${routeId}…`, 'info');
  showSkeleton(true);
  clearResults();

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
    setStatus(`Ruta consultada — ${total} registro${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}.`, 'success');
    SharedUI.showToast(`${total} registros encontrados.`, 'success', { title: 'Consulta completada' });
  } catch (error) {
    const msg = error?.message || 'No se pudo consultar la ruta.';
    if (normalizeText(msg).includes('sesion de urbano')) paintSessionStatus({ connected: false });
    setStatus(msg, 'error');
    SharedUI.showToast(msg, 'error', { title: 'Error de consulta' });
    showSkeleton(false);
  } finally {
    SharedUI.setButtonLoading('btn-consultar-ruta', false, 'Consultar ruta');
  }
}

/* ══ FILTERS ═══════════════════════════════════════════ */
function applyFilters() {
  const locality = normalizeText(document.getElementById('select-localidad-filter')?.value || '');
  const sort     = document.getElementById('select-result-sort')?.value || 'default';

  RouteLookupState.filteredRecords = [...RouteLookupState.records].filter(item =>
    !locality || normalizeText(item.localidad || '') === locality
  );
  RouteLookupState.filteredRecords.sort((a, b) => compareRecords(a, b, sort));
  renderResults();
}

/* ══ RENDER ════════════════════════════════════════════ */
function renderResults() {
  showSkeleton(false);
  renderPreviewTable();
  renderModalTable();
  updateResultsMeta();
  updateActionButtons();
}

function renderPreviewTable() {
  const tbody    = document.getElementById('preview-rutas-body');
  const emptyEl  = document.getElementById('results-empty-state');
  const tableEl  = document.getElementById('cr-preview-table');
  const footerEl = document.getElementById('cr-table-footer');
  if (!tbody) return;

  const hasRows = RouteLookupState.filteredRecords.length > 0;
  if (emptyEl)  emptyEl.style.display  = hasRows ? 'none' : 'flex';
  if (tableEl)  tableEl.style.display  = hasRows ? 'table' : 'none';
  if (footerEl) footerEl.style.display = hasRows ? 'flex' : 'none';
  if (!hasRows) return;

  tbody.innerHTML = RouteLookupState.filteredRecords.slice(0, MAX_PREVIEW_ROWS).map(renderRow).join('');
}

function renderModalTable() {
  const tbody = document.getElementById('tabla-rutas-body');
  if (!tbody) return;
  if (!RouteLookupState.filteredRecords.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="cr-empty-row">No hay registros para mostrar.</td></tr>';
    return;
  }
  tbody.innerHTML = RouteLookupState.filteredRecords.map(renderRow).join('');
}

function renderRow(item) {
  return `
    <tr>
      <td class="mono-cell">${escHtml(sanitize(item.routeId || '-'))}</td>
      <td class="mono-cell">${escHtml(fmtGuide(item.guia))}</td>
      <td class="mono-cell">${escHtml(sanitize(item.rastreo || '-'))}</td>
      <td><div class="client-cell"><span class="client-name">${escHtml(sanitize(item.cliente || '-'))}</span></div></td>
      <td>${escHtml(fmtPhone(item.telefono))}</td>
      <td>${escHtml(sanitize(item.contrato || '-'))}</td>
      <td><span class="location-badge">${escHtml(sanitize(item.localidad || '-'))}</span></td>
    </tr>`;
}

function updateResultsMeta() {
  const count   = RouteLookupState.filteredRecords.length;
  const total   = RouteLookupState.records.length;
  const routeId = sanitize(RouteLookupState.routeResult?.routeId || '-');

  const sub = total > 0
    ? `${count} registro${count !== 1 ? 's' : ''}${total !== count ? ` (filtrado de ${total})` : ''}`
    : 'Consulta una ruta para visualizar los registros.';

  SharedUI.setText('result-status-sub',   sub);
  SharedUI.setText('results-range',       buildRangeLabel(count));
  SharedUI.setText('modal-visible-count', String(count));
  SharedUI.setText('modal-results-range', buildRangeLabel(count));
  SharedUI.setText('modal-route-id',      routeId);
}

function buildRangeLabel(count) {
  if (!count) return 'Sin registros.';
  if (count <= MAX_PREVIEW_ROWS) return `${count} registro${count === 1 ? '' : 's'}.`;
  return `Mostrando ${MAX_PREVIEW_ROWS} de ${count} registros.`;
}

function updateActionButtons() {
  const hasResults = RouteLookupState.filteredRecords.length > 0;
  const canSend    = hasResults && Boolean(RouteLookupState.selectedRouteId);

  const openModal = document.getElementById('btn-open-results-modal');
  const exportBtn = document.getElementById('btn-exportar-ruta');
  const sendBtn   = document.getElementById('btn-enviar-a-ruta');

  if (openModal) openModal.disabled = !hasResults;
  if (exportBtn) exportBtn.disabled = !hasResults;
  if (sendBtn)   sendBtn.disabled   = !canSend;
}

function updateLocalityFilter(records) {
  const select = document.getElementById('select-localidad-filter');
  if (!select) return;

  const prev = select.value || '';
  const locs = Array.from(new Set(
    records.map(i => sanitize(i.localidad || '')).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

  select.innerHTML = ['<option value="">Todas las localidades</option>',
    ...locs.map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`)
  ].join('');

  select.value    = locs.includes(prev) ? prev : '';
  select.disabled = !RouteLookupState.urbanoConnected || locs.length <= 1;
}

/* ── Skeleton ─────────────────────────────────────────── */
function showSkeleton(show) {
  const sk      = document.getElementById('cr-skeleton');
  const emptyEl = document.getElementById('results-empty-state');
  const tableEl = document.getElementById('cr-preview-table');
  if (sk)      sk.style.display      = show ? 'block' : 'none';
  if (emptyEl) emptyEl.style.display = show ? 'none' : 'flex';
  if (tableEl) tableEl.style.display = 'none';
}

function clearResults() {
  RouteLookupState.records         = [];
  RouteLookupState.filteredRecords = [];
  RouteLookupState.routeResult     = null;
  SharedUI.setText('stat-route-id',         '—');
  SharedUI.setText('stat-total-guias',       '0');
  SharedUI.setText('stat-total-registros',   '0');
  SharedUI.setText('stat-total-localidades', '0');
  updateLocalityFilter([]);
}

function setStatus(text, type = 'idle') {
  const bar = document.getElementById('cr-status-bar');
  const txt = document.getElementById('cr-status-text');
  if (!bar || !txt) return;
  bar.className = 'cr-status-bar';
  if (type === 'info')    bar.classList.add('info');
  if (type === 'success') bar.classList.add('success');
  if (type === 'error')   bar.classList.add('error');
  txt.textContent = text;
}

/* ══ CONFIRM SEND ══════════════════════════════════════ */
function openConfirmSend() {
  const count = RouteLookupState.filteredRecords.length;
  const desc  = document.getElementById('confirm-send-desc');
  if (desc) {
    const dest = RouteLookupState.destinations.find(r => String(r.id) === String(RouteLookupState.selectedRouteId));
    const name = dest ? sanitize(dest.nombre_lote || `Ruta ${dest.id}`) : '—';
    desc.textContent = `Vas a enviar ${count} registro${count !== 1 ? 's' : ''} al lote "${name}". ¿Deseas continuar?`;
  }
  toggleModal('confirm-send-modal', true);
}

async function confirmSend() {
  toggleModal('confirm-send-modal', false);
  await sendVisibleRecordsToRoute();
}

async function sendVisibleRecordsToRoute() {
  if (!RouteLookupState.selectedRouteId) {
    SharedUI.showToast('Selecciona un lote destino.', 'error', { title: 'Falta destino' });
    return;
  }
  if (!RouteLookupState.filteredRecords.length) {
    SharedUI.showToast('No hay registros visibles.', 'error', { title: 'Sin registros' });
    return;
  }

  const avisos = RouteLookupState.filteredRecords
    .map(item => ({
      nombre:         sanitize(item.cliente || ''),
      telefono:       String(item.telefono || '').trim(),
      codigo_paquete: sanitize(item.guia || ''),
      empresa_origen: 'Urbano',
      mensaje:        null
    }))
    .filter(i => i.telefono);

  if (!avisos.length) {
    SharedUI.showToast('Los registros no tienen teléfonos válidos.', 'error', { title: 'Datos incompletos' });
    return;
  }

  SharedUI.setButtonLoading('btn-enviar-a-ruta', true, 'Enviando…');
  try {
    const response = await API.Avisos.importar({ lote_id: Number(RouteLookupState.selectedRouteId), avisos });
    const count    = Number(response?.importados ?? avisos.length);
    setStatus(`${count} destinatario${count !== 1 ? 's' : ''} importado${count !== 1 ? 's' : ''} correctamente.`, 'success');
    SharedUI.showToast('Importación completada.', 'success', { title: 'Enviado' });
  } catch (error) {
    SharedUI.showToast(error?.message || 'No se pudo importar al lote.', 'error', { title: 'Error' });
  } finally {
    SharedUI.setButtonLoading('btn-enviar-a-ruta', false, 'Enviar al lote');
  }
}

/* ══ EXPORT ════════════════════════════════════════════ */
function exportResultsToExcel() {
  if (!RouteLookupState.filteredRecords.length) {
    SharedUI.showToast('No hay datos para exportar.', 'info', { title: 'Sin datos' });
    return;
  }
  if (!window.XLSX) {
    SharedUI.showToast('Librería de exportación no disponible.', 'error', { title: 'Error' });
    return;
  }
  const routeId   = sanitize(RouteLookupState.routeResult?.routeId || 'ruta');
  const worksheet = window.XLSX.utils.json_to_sheet(
    RouteLookupState.filteredRecords.map(item => ({
      'Ruta ID':   sanitize(item.routeId),
      'Guía':      fmtGuide(item.guia),
      'Rastreo':   sanitize(item.rastreo),
      'Cliente':   sanitize(item.cliente),
      'Teléfono':  fmtPhone(item.telefono),
      'Contrato':  sanitize(item.contrato),
      'Localidad': sanitize(item.localidad)
    }))
  );
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, worksheet, 'Ruta');
  window.XLSX.writeFile(wb, `ruta_${routeId}.xlsx`);
  SharedUI.showToast('Archivo Excel generado.', 'success', { title: 'Exportado' });
}

/* ══ HELPERS ═══════════════════════════════════════════ */
function compareRecords(a, b, sort) {
  if (sort === 'default') return 0;
  const [field, dir] = sort.split('-');
  const va = normalizeText(a[field] || '');
  const vb = normalizeText(b[field] || '');
  if (va === vb) return 0;
  return (va > vb ? 1 : -1) * (dir === 'desc' ? -1 : 1);
}

function getLocalityCount(records) {
  return new Set(records.map(i => sanitize(i.localidad || '')).filter(Boolean)).size;
}

function hasLocalityOptions() {
  return (document.getElementById('select-localidad-filter')?.options?.length || 0) > 1;
}

function sanitize(v)      { return String(v ?? '').trim() || '-'; }

function normalizeText(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function fmtGuide(v) { const t = sanitize(v); return t === '-' ? t : t.toUpperCase(); }

function fmtPhone(v) {
  const raw = String(v || '').replace(/\D+/g, '');
  if (!raw) return '-';
  return raw.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
