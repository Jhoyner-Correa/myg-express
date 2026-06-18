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
      if (status === 'enviado_manual' || status === 'manual') return 'manual';
      if (status === 'sin_whatsapp' || status === 'no_whatsapp') return 'sin-whatsapp';
      if (status === 'fallido' || status === 'error' || status === 'auth_failure' || status === 'fail' || status === 'cancelado') return 'fallido';
      return 'pendiente';
    }

    function formatEstadoLabel(value) {
      const estado = String(value || 'pendiente').toLowerCase();
      if (estado === 'auth_failure') return 'Error';
      if (estado === 'processing') return 'Procesando';
      if (estado === 'sin_whatsapp' || estado === 'no_whatsapp') return 'Sin WhatsApp';
      if (estado === 'enviado_manual') return 'Manual';
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

        let indicatorHtml = `<span class="dot dot-${estadoVisual}" id="dot-${aviso.id}"></span>`;
        if (estadoVisual === 'enviado') {
          indicatorHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><polyline points="20 6 9 17 4 12"/></svg>`;
        }
        if (estadoVisual === 'manual') {
          indicatorHtml = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
        }

        return `
          <tr data-id="${aviso.id}" id="row-${aviso.id}">
            <td><span class="aviso-id">${index + 1}</span></td>
            <td class="aviso-nombre">${escapeHtml(aviso.nombre || '-')}</td>
            <td><span class="telefono-badge">${escapeHtml(aviso.telefono || '-')}</span></td>
            <td>${escapeHtml(aviso.codigo_paquete || '-')}</td>
            <td>
              <div style="position:relative;">
                <span class="estado-badge estado-${estadoVisual}" id="badge-${aviso.id}">
                  ${indicatorHtml}
                  ${formatEstadoLabel(aviso.estado_aviso)}
                </span>
                <div class="row-prog-wrap" id="prog-${aviso.id}"><div class="row-prog-fill" id="pfill-${aviso.id}"></div></div>
              </div>
            </td>
            <td>${aviso.fecha_envio ? formatFechaHora(aviso.fecha_envio) : '<span class="sin-envio">-</span>'}</td>
            <td>
              <div class="row-actions">
                <button class="btn-row-delete" type="button" data-action="delete-aviso" data-id="${aviso.id}" title="Eliminar">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function getFilteredAvisos() {
      let result = [...state.avisos];

      const statusFilter = state.statusFilter || 'todos';
      if (statusFilter !== 'todos') {
        result = result.filter((item) => {
          const visual = normalizeAvisoVisualStatus(item.estado_aviso);
          if (statusFilter === 'sin-whatsapp') return visual === 'sin-whatsapp';
          if (statusFilter === 'fallido') return visual === 'fallido';
          if (statusFilter === 'pendiente') return visual === 'pendiente';
          if (statusFilter === 'enviado') return visual === 'enviado';
          if (statusFilter === 'manual') return visual === 'manual';
          if (statusFilter === 'entregado') return visual === 'entregado';
          return true;
        });
      }

      const query = String(state.searchQuery || '').trim().toLowerCase();
      if (query) {
        result = result.filter((item) =>
          [item.nombre, item.telefono, item.codigo_paquete]
            .some((value) => String(value || '').toLowerCase().includes(query))
        );
      }

      return result;
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
      return rows.map((item) => [
        item.id,
        item.estado_aviso,
        item.fecha_envio,
        item.nombre,
        item.telefono,
        item.codigo_paquete
      ].join('|')).join('||');
    }

    function updatePaginationMeta(totalAll, visibleCount) {
      const meta = document.getElementById('tabla-avisos-meta');

      if (meta) {
        if (!totalAll) {
          meta.textContent = 'Sin destinatarios para mostrar';
        } else {
          const hasSearch = String(state.searchQuery || '').trim().length > 0;
          const hasFilter = state.statusFilter && state.statusFilter !== 'todos';
          const filtered = hasSearch || hasFilter;
          meta.textContent = filtered
            ? `Mostrando ${visibleCount} de ${totalAll} destinatarios`
            : `Mostrando ${visibleCount} destinatarios`;
        }
      }
    }

    function updateAvisosView({ forceRender = false } = {}) {
      const filteredAvisos = getFilteredAvisos();
      const visibleRows = filteredAvisos;
      const visibleSignature = buildVisibleRowsSignature(visibleRows);

      if (forceRender || visibleSignature !== state.lastVisibleRowsSignature) {
        renderAvisos(visibleRows);
        state.lastVisibleRowsSignature = visibleSignature;
      }

      updatePaginationMeta(state.avisos.length, visibleRows.length);
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
      const manuales = state.avisos.filter((item) => item.estado_aviso === 'enviado_manual').length;
      const pendientes = state.avisos.filter((item) => item.estado_aviso === 'pendiente').length;
      const fallidos = state.avisos.filter((item) => ['fallido', 'cancelado', 'sin_whatsapp', 'no_whatsapp'].includes(String(item.estado_aviso || '').toLowerCase())).length;
      const entregados = state.avisos.filter((item) => item.estado_aviso === 'entregado').length;

      const pct = (value) => (total ? Math.round((value / total) * 100) : 0);
      const pendientesPct = pct(pendientes);
      const enviadosPct = pct(enviados);
      const fallidosPct = pct(fallidos);
      const entregadosPct = pct(entregados);
      const progreso = total ? Math.round(((enviados + manuales + entregados) / total) * 100) : 0;

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
      bumpElement('destinatarios-total-badge', total);
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
      SharedUI.setText('hero-progress-note', total ? `${enviados + manuales + entregados} de ${total} destinatarios procesados` : 'Sin actividad registrada');
      const $pc = document.querySelector('.route-progress-card');
      if ($pc) $pc.classList.toggle('is-active', total > 0);

      const setWidth = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.style.width = `${value}%`;
      };

      setWidth('stat-pendientes-bar', pendientesPct);
      setWidth('stat-enviados-bar', enviadosPct);
      setWidth('stat-fallidos-bar', fallidosPct);
      setWidth('stat-entregados-bar', entregadosPct);
      setWidth('hero-progress-bar', progreso);

      const progressRing = document.getElementById('hero-progress-ring');
      if (progressRing) progressRing.style.setProperty('--progress', String(progreso));
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

    function bindRowActions() {
      document.getElementById('tabla-avisos-body')?.addEventListener('click', async (event) => {
        const target = event.target.closest('[data-action="delete-aviso"]');
        if (!target || typeof onDelete !== 'function') return;
        await onDelete(target.dataset.id);
      });
    }

    function bindFiltros() {
      const toggleBtn = document.getElementById('btn-filtros');
      const panel = document.getElementById('filter-panel');
      if (!toggleBtn || !panel) return;

      toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('open');
      });

      panel.addEventListener('click', (event) => {
        const chip = event.target.closest('.filter-chip');
        if (!chip) return;

        const filter = chip.dataset.filter;
        state.statusFilter = filter;

        panel.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        updateAvisosView({ forceRender: true });
      });
    }

    function exportAvisos() {
      const data = getFilteredAvisos();
      if (!data.length) {
        SharedUI.showToast('No hay destinatarios para exportar.', 'info', { title: 'Sin datos' });
        return;
      }
      if (!window.XLSX) {
        SharedUI.showToast('No se cargo el modulo de exportacion XLSX.', 'error', { title: 'Error' });
        return;
      }
      const rows = data.map((item, i) => ({
        '#': i + 1,
        Nombre: item.nombre || '',
        Telefono: item.telefono || '',
        'Codigo paquete': item.codigo_paquete || '',
        Estado: formatEstadoLabel(item.estado_aviso),
        'Fecha envio': item.fecha_envio ? formatFechaHora(item.fecha_envio) : ''
      }));
      const ws = window.XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 5 },
        { wch: 30 },
        { wch: 15 },
        { wch: 18 },
        { wch: 14 },
        { wch: 18 }
      ];
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Destinatarios');
      const name = document.getElementById('hero-lote-id')?.textContent?.trim() || 'ruta';
      window.XLSX.writeFile(wb, `destinatarios_${name}.xlsx`);
      SharedUI.showToast(`${data.length} destinatarios exportados.`, 'success', { title: 'Exportado' });
    }

    function bindExport() {
      document.getElementById('btn-exportar-avisos')?.addEventListener('click', exportAvisos);
    }

    return {
      bindBusqueda,
      bindRowActions,
      bindFiltros,
      bindExport,
      updateAvisosView,
      updateCounters,
      buildAvisosSignature,
      normalizeAvisoVisualStatus,
      formatEstadoLabel,
      getFilteredAvisos
    };
  };
})(window);
