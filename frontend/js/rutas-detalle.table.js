(function initRutasDetalleTableModule(global) {
  global.RutasDetalleTableModule = function createRutasDetalleTableModule({
    state,
    escapeHtml,
    formatFechaHora,
    capitalize,
    pauseAutoRefresh,
    onDelete
  }) {
    function normalizeAvisoVisualStatus(value) {
      const status = String(value || 'pendiente').toLowerCase();
      if (status === 'processing' || status === 'procesando' || status === 'sending') return 'enviando';
      if (status === 'enviado' || status === 'entregado' || status === 'sent') return 'enviado';
      if (status === 'fallido' || status === 'error' || status === 'auth_failure' || status === 'fail' || status === 'cancelado') return 'fallido';
      return 'pendiente';
    }

    function formatEstadoLabel(value) {
      const estado = String(value || 'pendiente').toLowerCase();
      if (estado === 'auth_failure') return 'Error';
      if (estado === 'processing') return 'Procesando';
      return capitalize(estado);
    }

    function renderAvisos(lista) {
      const tbody = document.getElementById('tabla-avisos-body');
      if (!tbody) return;

      if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No hay destinatarios en esta ruta. Importa un archivo o crea uno manualmente.</td></tr>';
        return;
      }

      tbody.innerHTML = lista.map((aviso, index) => {
        const estadoVisual = normalizeAvisoVisualStatus(aviso.estado_aviso);
        return `
          <tr data-id="${aviso.id}" id="row-${aviso.id}">
            <td><span class="aviso-id">${(state.currentPage - 1) * state.pageSize + index + 1}</span></td>
            <td class="aviso-nombre">${escapeHtml(aviso.nombre || '-')}</td>
            <td><span class="telefono-badge">${escapeHtml(aviso.telefono || '-')}</span></td>
            <td>${escapeHtml(aviso.codigo_paquete || '-')}</td>
            <td>
              <div style="position:relative;">
                <span class="estado-badge estado-${estadoVisual}" id="badge-${aviso.id}">
                  <span class="dot dot-${estadoVisual}" id="dot-${aviso.id}"></span>
                  ${formatEstadoLabel(aviso.estado_aviso)}
                </span>
                <div class="row-prog-wrap" id="prog-${aviso.id}"><div class="row-prog-fill" id="pfill-${aviso.id}"></div></div>
              </div>
            </td>
            <td>${aviso.fecha_envio ? formatFechaHora(aviso.fecha_envio) : '<span class="sin-envio">-</span>'}</td>
            <td>
              <div class="row-actions">
                <button class="btn-row-delete" type="button" data-action="delete-aviso" data-id="${aviso.id}" title="Eliminar destinatario">
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function getFilteredAvisos() {
      const query = String(state.searchQuery || '').trim().toLowerCase();
      if (!query) return [...state.avisos];

      return state.avisos.filter((item) =>
        [item.nombre, item.telefono, item.codigo_paquete]
          .some((value) => String(value || '').toLowerCase().includes(query))
      );
    }

    function buildAvisosSignature(avisos) {
      return avisos
        .map((item) => [
          item.id,
          item.estado_aviso,
          item.fecha_envio,
          item.nombre,
          item.telefono,
          item.codigo_paquete
        ].join('|'))
        .join('||');
    }

    function buildVisibleRowsSignature(rows) {
      return `${state.currentPage}:${rows.map((item) => [
        item.id,
        item.estado_aviso,
        item.fecha_envio,
        item.nombre,
        item.telefono,
        item.codigo_paquete
      ].join('|')).join('||')}`;
    }

    function updatePaginationMeta(total, visibleCount, totalPages) {
      const meta = document.getElementById('tabla-avisos-meta');
      const indicator = document.getElementById('tabla-page-indicator');
      const prev = document.getElementById('btn-prev-page');
      const next = document.getElementById('btn-next-page');

      if (meta) {
        if (!total) {
          meta.textContent = 'Sin destinatarios para mostrar';
        } else {
          const from = (state.currentPage - 1) * state.pageSize + 1;
          const to = from + visibleCount - 1;
          meta.textContent = `Mostrando ${from}-${to} de ${total} destinatarios`;
        }
      }

      if (indicator) indicator.textContent = `Pagina ${state.currentPage} de ${totalPages}`;
      if (prev) prev.disabled = state.currentPage <= 1;
      if (next) next.disabled = state.currentPage >= totalPages;
    }

    function updateAvisosView({ resetPage = false, forceRender = false } = {}) {
      if (resetPage) state.currentPage = 1;

      const filteredAvisos = getFilteredAvisos();
      const total = filteredAvisos.length;
      const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
      state.currentPage = Math.min(Math.max(1, state.currentPage), totalPages);

      const start = (state.currentPage - 1) * state.pageSize;
      const visibleRows = filteredAvisos.slice(start, start + state.pageSize);
      const visibleSignature = buildVisibleRowsSignature(visibleRows);

      if (forceRender || visibleSignature !== state.lastVisibleRowsSignature) {
        renderAvisos(visibleRows);
        state.lastVisibleRowsSignature = visibleSignature;
      }

      updatePaginationMeta(total, visibleRows.length, totalPages);
    }

    function renderEnvioSummaryCount(id, value) {
      const el = document.getElementById(id);
      if (!el) return;

      const nextValue = String(value);
      if (el.textContent !== nextValue) {
        el.textContent = nextValue;
        el.classList.remove('bump');
        void el.offsetWidth;
        el.classList.add('bump');
        window.setTimeout(() => el.classList.remove('bump'), 320);
        return;
      }

      el.textContent = nextValue;
    }

    function updateCounters() {
      const total = state.avisos.length;
      const enviados = state.avisos.filter((item) => item.estado_aviso === 'enviado').length;
      const pendientes = state.avisos.filter((item) => item.estado_aviso === 'pendiente').length;
      const fallidos = state.avisos.filter((item) => ['fallido', 'cancelado'].includes(String(item.estado_aviso || '').toLowerCase())).length;
      const entregados = state.avisos.filter((item) => item.estado_aviso === 'entregado').length;

      const pct = (value) => (total ? Math.round((value / total) * 100) : 0);
      const pendientesPct = pct(pendientes);
      const enviadosPct = pct(enviados);
      const fallidosPct = pct(fallidos);
      const entregadosPct = pct(entregados);
      const progreso = total ? Math.round(((enviados + entregados) / total) * 100) : 0;

      const bumpElement = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;

        const nextValue = String(value);
        if (el.textContent !== nextValue) {
          el.textContent = nextValue;
          el.classList.remove('pop');
          void el.offsetWidth;
          el.classList.add('pop');
          return;
        }

        el.textContent = nextValue;
      };

      bumpElement('stat-total', total);
      bumpElement('hero-total-card', total);
      bumpElement('stat-enviados', enviados);
      bumpElement('stat-pendientes', pendientes);
      bumpElement('count-fallido', fallidos);
      bumpElement('count-entregado', entregados);

      SharedUI.setText('stat-pendientes-pct', `${pendientesPct}%`);
      SharedUI.setText('stat-enviados-pct', `${enviadosPct}%`);
      SharedUI.setText('stat-fallidos-pct', `${fallidosPct}%`);
      SharedUI.setText('stat-entregados-pct', `${entregadosPct}%`);
      SharedUI.setText('hero-progress-value', `${progreso}%`);
      SharedUI.setText('hero-progress-note', total ? `${enviados + entregados} de ${total} destinatarios procesados` : 'Sin actividad registrada');

      const setWidth = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.style.width = `${value}%`;
      };

      setWidth('stat-pendientes-bar', pendientesPct);
      setWidth('stat-enviados-bar', enviadosPct);
      setWidth('stat-fallidos-bar', fallidosPct);
      setWidth('stat-entregados-bar', entregadosPct);
      setWidth('hero-progress-bar', progreso);
    }

    function bindBusqueda() {
      const input = document.getElementById('input-buscar-aviso');
      let searchTimer = null;

      input?.addEventListener('input', () => {
        pauseAutoRefresh(15000);
        if (searchTimer) {
          clearTimeout(searchTimer);
        }

        searchTimer = window.setTimeout(() => {
          state.searchQuery = input.value.trim();
          updateAvisosView({ resetPage: true });
        }, 120);
      });
    }

    function bindPaginacion() {
      document.getElementById('btn-prev-page')?.addEventListener('click', () => {
        if (state.currentPage <= 1) return;
        pauseAutoRefresh();
        state.currentPage -= 1;
        updateAvisosView();
      });

      document.getElementById('btn-next-page')?.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(getFilteredAvisos().length / state.pageSize));
        if (state.currentPage >= totalPages) return;
        pauseAutoRefresh();
        state.currentPage += 1;
        updateAvisosView();
      });
    }

    function bindRowActions() {
      document.getElementById('tabla-avisos-body')?.addEventListener('click', async (event) => {
        const target = event.target.closest('[data-action="delete-aviso"]');
        if (!target || typeof onDelete !== 'function') return;
        await onDelete(target.dataset.id);
      });
    }

    return {
      bindBusqueda,
      bindPaginacion,
      bindRowActions,
      updateAvisosView,
      updateCounters,
      buildAvisosSignature,
      normalizeAvisoVisualStatus,
      formatEstadoLabel,
      getFilteredAvisos
    };
  };
})(window);
