document.addEventListener('DOMContentLoaded', async () => {
  if (!API.Auth.requirePermission('rutas.ver')) return;
  API.ensureSuperadminSidebar();

  const currentUser = API.getUser();
  const ui = window.SharedUI || {};
  const state = {
    rutas: [],
    editandoId: null
  };
  const helpers = {
    escapeHtml: ui.escapeHtml || ((value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')),
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

  async function populateZoneSelect() {
    const select = document.getElementById('select-nombre-lote');
    if (!select) return;
    try {
      const response = await API.Zonas.listar();
      const options = response?.data || [];
      select.innerHTML = `
        <option value="">Selecciona una ruta</option>
        ${options.map(opt => `<option value="${helpers.escapeHtml(opt.nombre)}">${helpers.escapeHtml(opt.nombre)}</option>`).join('')}
      `;
    } catch (e) {
      console.error('Error al cargar zonas', e);
    }
  }

  async function populateZoneManagementList() {
    const list = document.getElementById('lista-opciones-gestion');
    if (!list) return;
    try {
      const response = await API.Zonas.listar();
      const options = response?.data || [];
      list.innerHTML = options.map((opt) => `
        <div class="route-zone-option">
          <span class="route-zone-option-name">${helpers.escapeHtml(opt.nombre)}</span>
          <button type="button" class="btn-delete-zone-option" data-id="${opt.id}" title="Eliminar opción">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      `).join('');
    } catch (e) {
      console.error('Error al gestionar zonas', e);
    }
  }

  // Inicializar componentes
  hydrateChrome();
  bindModal();
  bindFilters();
  bindReportModal();
  bindActionDropdowns();
  bindHistoryModal();
  await loadRoutes();
  window.addEventListener('resize', drawChart);

  function hydrateChrome() {
    helpers.setText('user-nombre', currentUser?.nombre || 'Usuario');
    helpers.setText('user-sede', currentUser?.sede_nombre || '-');
    helpers.setText('user-rol', currentUser?.rol || '-');
    helpers.setText('user-rol-topbar', currentUser?.rol_label || currentUser?.rol || 'Encargado de Oficina');
    helpers.setText('user-avatar', (currentUser?.nombre || 'U').charAt(0).toUpperCase());
    document.getElementById('btn-logout')?.addEventListener('click', () => API.Auth.logout());
  }

  function normalizeRouteName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function validateRouteName(value) {
    const normalized = normalizeRouteName(value);

    if (!normalized) {
      return 'Debes seleccionar o escribir el nombre de la ruta.';
    }

    return '';
  }

  function getEditableRouteName(value) {
    return String(value || '').trim();
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    const dateStr = date.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    let timeStr = date.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    // Normalizar sufijo a formato estándar AM/PM
    timeStr = timeStr.replace(/\s*[aApP]\.?[mM]\.?\s*/g, (m) => m.toLowerCase().includes('p') ? ' PM' : ' AM');
    return `${dateStr}, ${timeStr}`;
  }

  function formatStatus(value) {
    const status = String(value || 'pendiente').toLowerCase();
    if (status === 'procesando') return 'En proceso';
    if (status === 'completado') return 'Finalizada';
    if (status === 'cancelado') return 'Cancelado';
    if (status === 'pausado') return 'Pausado';
    return 'Pendiente';
  }

  function getRouteSortTime(route) {
    const candidates = [route?.created_at, route?.updated_at, route?.fecha];
    for (const value of candidates) {
      if (!value) continue;
      const time = new Date(value).getTime();
      if (!Number.isNaN(time)) return time;
    }
    return 0;
  }

  function compareRoutesNewestFirst(a, b) {
    const byDate = getRouteSortTime(b) - getRouteSortTime(a);
    if (byDate !== 0) return byDate;
    return Number(b?.id || 0) - Number(a?.id || 0);
  }

  function getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getYesterdayKey() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function updateStatsAndChart() {
    // Total de rutas creadas
    const totalCount = state.rutas.length;
    helpers.setText('stats-total-count', totalCount);

    // Comparar hoy vs ayer
    const todayKey = getTodayKey();
    const yesterdayKey = getYesterdayKey();

    const todayCount = state.rutas.filter((r) => String(r.fecha || '').startsWith(todayKey)).length;
    const yesterdayCount = state.rutas.filter((r) => String(r.fecha || '').startsWith(yesterdayKey)).length;

    let trendPercent = 0;
    if (yesterdayCount > 0) {
      trendPercent = Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);
    } else if (todayCount > 0) {
      trendPercent = 100;
    }

    const trendBadge = document.getElementById('stats-trend-badge');
    if (trendBadge) {
      if (trendPercent < 0) {
        trendBadge.className = 'trend-badge negative';
        trendBadge.innerHTML = `
          <svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
          <span id="stats-trend-value">${trendPercent}% vs ayer</span>
        `;
      } else {
        trendBadge.className = 'trend-badge';
        trendBadge.innerHTML = `
          <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          <span id="stats-trend-value">+${trendPercent}% vs ayer</span>
        `;
      }
    }

    // Dibujar tendencia acumulada con canvas nativo.
    drawChart();
  }

  function drawChart() {
    const canvas = document.getElementById('lineChart');
    if (!canvas) return;
    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    const W = Math.floor(rect.width);
    const H = Math.min(68, Math.floor(rect.height || 68));
    if (W <= 0 || H <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(23, 59, 59, 999);
      days.push(day);
    }

    const createdTimes = state.rutas
      .map((ruta) => new Date(ruta.created_at || ruta.fecha || ruta.updated_at || '').getTime())
      .filter((time) => Number.isFinite(time));

    const data = createdTimes.length
      ? days.map((day) => createdTimes.filter((time) => time <= day.getTime()).length)
      : Array.from({ length: 14 }, () => 0);

    const pl = 10, pr = 10, pt = 9, pb = 12;
    const cw = W - pl - pr;
    const ch = H - pt - pb;
    const minVal = Math.min(...data);
    const maxVal = Math.max(...data);
    const pad = Math.max(1, Math.ceil((maxVal - minVal) * 0.35));
    const yMin = Math.max(0, minVal - pad);
    const yMax = Math.max(maxVal + pad, yMin + 1);
    const yR = yMax - yMin || 1;

    const pts = data.map((v, i) => ({
      x: pl + (i / (data.length - 1)) * cw,
      y: pt + ch - ((v - yMin) / yR) * ch
    }));

    ctx.clearRect(0, 0, W, H);

    // 1. Sombra sutil de la línea (glow)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const offset = (p1.x - p0.x) * 0.35;
      ctx.bezierCurveTo(p0.x + offset, p0.y, p1.x - offset, p1.y, p1.x, p1.y);
    }
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.075)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    // 2. Relleno degradado premium — multi-stop
    const grad = ctx.createLinearGradient(0, pt - 2, 0, pt + ch + 10);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
    grad.addColorStop(0.28, 'rgba(16, 185, 129, 0.12)');
    grad.addColorStop(0.62, 'rgba(16, 185, 129, 0.045)');
    grad.addColorStop(0.86, 'rgba(16, 185, 129, 0.012)');
    grad.addColorStop(1, 'rgba(16, 185, 129, 0)');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pt + ch);
    ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const offset = (p1.x - p0.x) * 0.35;
      ctx.bezierCurveTo(p0.x + offset, p0.y, p1.x - offset, p1.y, p1.x, p1.y);
    }
    ctx.lineTo(pts[pts.length - 1].x, pt + ch);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 3. Línea principal con gradiente horizontal
    const lineGrad = ctx.createLinearGradient(pl, 0, pl + cw, 0);
    lineGrad.addColorStop(0, '#0ea95a');
    lineGrad.addColorStop(0.55, '#12b76a');
    lineGrad.addColorStop(1, '#078c4a');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const offset = (p1.x - p0.x) * 0.35;
      ctx.bezierCurveTo(p0.x + offset, p0.y, p1.x - offset, p1.y, p1.x, p1.y);
    }
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 4. Puntos clave — sutiles y elegantes
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0ea95a';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Punto final destacado
    const last = pts[pts.length - 1];
    ctx.save();
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.055)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(last.x, last.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#0ea95a';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }



  function bindModal() {
    const modal = document.getElementById('modal-lote');
    const form = document.getElementById('form-lote');
    const saveButton = document.getElementById('btn-guardar-lote');
    const selectLote = document.getElementById('select-nombre-lote');
    const modalTitle = document.querySelector('#modal-lote .modal-title');

    // Inicializar select
    populateZoneSelect();

    const openCreateModal = () => {
      form?.reset();
      state.editandoId = null;
      if (modalTitle) modalTitle.textContent = 'Crear nueva ruta';
      if (saveButton) saveButton.textContent = 'Crear ruta ahora';
      populateZoneSelect();
      document.getElementById('panel-opciones-editor').style.display = 'none';
      modal?.classList.add('open');
      selectLote?.focus();
    };

    const closeModal = () => modal?.classList.remove('open');

    document.getElementById('btn-nuevo-lote')?.addEventListener('click', openCreateModal);
    document.getElementById('btn-cerrar-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-cancelar-modal')?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Botón para alternar la visualización del gestor de opciones
    document.getElementById('btn-gestionar-opciones')?.addEventListener('click', () => {
      const panel = document.getElementById('panel-opciones-editor');
      if (panel) {
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          populateZoneManagementList();
        }
      }
    });

    // Agregar nueva opción de zona
    document.getElementById('btn-agregar-opcion')?.addEventListener('click', async () => {
      const input = document.getElementById('input-nueva-opcion');
      const val = String(input?.value || '').trim();
      if (!val) return;
      if (/\d/.test(val)) {
        helpers.showToast('El nombre de la zona no puede contener números.', 'warning', { title: 'Nombre inválido' });
        return;
      }
      try {
        const response = await API.Zonas.crear(val);
        if (response?.ok) {
          if (input) input.value = '';
          await populateZoneSelect();
          await populateZoneManagementList();
          if (selectLote) selectLote.value = val;
          helpers.showToast('Opción agregada correctamente.', 'success', { title: 'Zona agregada' });
        } else {
          helpers.showToast(response?.message || 'Error al agregar la opción.', 'warning', { title: 'No se pudo agregar' });
        }
      } catch (err) {
        helpers.showToast(err?.message || 'Error al conectar con el servidor.', 'error', { title: 'Error' });
      }
    });

    // Eliminar opción de zona
    document.getElementById('lista-opciones-gestion')?.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.btn-delete-zone-option');
      if (deleteBtn) {
        const zoneId = deleteBtn.getAttribute('data-id');
        try {
          const response = await API.Zonas.eliminar(zoneId);
          if (response?.ok) {
            await populateZoneSelect();
            await populateZoneManagementList();
            helpers.showToast('Opción eliminada correctamente.', 'success', { title: 'Zona eliminada' });
          } else {
            helpers.showToast(response?.message || 'Error al eliminar la opción.', 'warning', { title: 'No se pudo eliminar' });
          }
        } catch (err) {
          helpers.showToast(err?.message || 'Error al conectar con el servidor.', 'error', { title: 'Error' });
        }
      }
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const chosenValue = selectLote?.value;
      if (!chosenValue) { helpers.showToast('Debes seleccionar una opción.', 'warning', { title: 'Campo requerido' }); return; }

      if (state.editandoId) {
        await submitRouteUpdate(state.editandoId, chosenValue, saveButton, closeModal);
      } else {
        await submitRouteCreate(chosenValue, saveButton, closeModal);
      }
    });

    document.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.btn-editar');
      if (editBtn) {
        const id = editBtn.getAttribute('data-id');
        const baseName = editBtn.getAttribute('data-base-name') || '';
        state.editandoId = id;
        if (modalTitle) modalTitle.textContent = 'Editar ruta';
        if (saveButton) saveButton.textContent = 'Guardar cambios';

        await populateZoneSelect();
        if (selectLote) {
          let hasOption = false;
          for (let i = 0; i < selectLote.options.length; i++) {
            if (selectLote.options[i].value === baseName) {
              hasOption = true;
              break;
            }
          }
          if (!hasOption && baseName && baseName !== '-') {
            const newOpt = document.createElement('option');
            newOpt.value = baseName;
            newOpt.textContent = baseName;
            selectLote.appendChild(newOpt);
          }
          selectLote.value = baseName === '-' ? selectLote.options[0]?.value || '' : baseName;
        }

        modal?.classList.add('open');
        selectLote?.focus();
        return;
      }
      const reportBtn = e.target.closest('.btn-reporte');
      if (reportBtn) {
        openReportModal(reportBtn.getAttribute('data-id'));
        return;
      }

    });
  }

  async function publishRouteToDeliveries(routeId, routeName, button) {
    if (!routeId || button.disabled) return;

    const ok = window.SharedUI?.confirm
      ? await window.SharedUI.confirm({
        title: 'Enviar a Gestión de entregas',
        message: `La ruta "${routeName}" quedará disponible para buscar paquetes y marcar recojos. Esta acción no envía WhatsApp ni duplica datos.`,
        confirmText: 'Enviar a entregas',
        type: 'success'
      })
      : window.confirm(`¿Enviar "${routeName}" a Gestión de entregas?`);

    if (!ok) return;

    helpers.setButtonLoading(button, true, {
      loadingText: 'Enviando...',
      idleText: button.dataset.originalText || button.textContent || 'Enviar a entregas'
    });

    try {
      const response = await API.Lotes.habilitarEntregas(routeId);
      if (!response?.ok) {
        throw new Error(response?.message || 'No se pudo enviar la ruta a Gestión de entregas.');
      }

      helpers.showToast(response.message || 'Ruta disponible en Gestión de entregas.', 'success', {
        title: 'Ruta enviada'
      });
      await loadRoutes();
    } catch (error) {
      helpers.showToast(error?.message || 'No se pudo enviar la ruta a Gestión de entregas.', 'error', {
        title: 'No se pudo completar'
      });
    } finally {
      helpers.setButtonLoading(button, false, {
        idleText: button.dataset.originalText || 'Enviar a entregas'
      });
    }
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
      nombre_lote: customName
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

    document.getElementById('reporte-body')?.addEventListener('click', (event) => {
      const reportItem = event.target.closest('.report-item[data-detail-target]');
      if (reportItem && reportItem.classList.contains('report-item--clickable')) {
        const detailContainer = document.getElementById(reportItem.getAttribute('data-detail-target'));
        if (detailContainer) {
          const isHidden = window.getComputedStyle(detailContainer).display === 'none';
          detailContainer.style.display = isHidden ? 'block' : 'none';

          if (isHidden) {
            reportItem.classList.add('report-item--expanded');
            setTimeout(() => {
              detailContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
          } else {
            reportItem.classList.remove('report-item--expanded');
          }
        }
      }
    });

    // Delegación de eventos para botones de copiar
    document.getElementById('reporte-body')?.addEventListener('click', async (event) => {
      const copyBtn = event.target.closest('.btn-copy-nowa-row');
      if (copyBtn) {
        event.stopPropagation();
        const textToCopy = copyBtn.getAttribute('data-copy');
        try {
          await navigator.clipboard.writeText(textToCopy);
          copyBtn.classList.add('is-copied');
          const originalSVG = copyBtn.querySelector('svg');
          const checkSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          checkSVG.setAttribute('viewBox', '0 0 24 24');
          checkSVG.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
          if (originalSVG) originalSVG.replaceWith(checkSVG);
          setTimeout(() => {
            copyBtn.classList.remove('is-copied');
          }, 2000);
        } catch (err) {
          console.error('Error al copiar:', err);
        }
        return;
      }

      const copyAllBtn = event.target.closest('.btn-copy-nowa-all');
      if (copyAllBtn) {
        event.stopPropagation();
        const textToCopy = copyAllBtn.getAttribute('data-copy-all');
        try {
          await navigator.clipboard.writeText(textToCopy);
          copyAllBtn.classList.add('is-copied');
          const originalHTML = copyAllBtn.innerHTML;
          copyAllBtn.innerHTML = `
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" stroke-width="3"/></svg>
            Copiado
          `;
          setTimeout(() => {
            copyAllBtn.classList.remove('is-copied');
            copyAllBtn.innerHTML = originalHTML;
          }, 2000);
        } catch (err) {
          console.error('Error al copiar:', err);
        }
      }
    });
  }

  async function openReportModal(routeId) {
    const modal = document.getElementById('modal-reporte');
    const body = document.getElementById('reporte-body');
    if (!modal || !body) return;

    modal.classList.add('open');
    body.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted);"><span class="spinner" style="border-top-color: var(--primary)"></span> Calculando métricas...</div>';

    try {
      const response = await API.Avisos.listarPorLote(routeId);
      const avisos = response?.data || [];
      const summary = buildReportSummary(avisos);
      body.innerHTML = buildReportMarkup(summary);
    } catch (error) {
      console.error('Error al cargar reporte de ruta:', error);
      body.innerHTML = '<div style="text-align:center; padding:30px; color:#ef4444;">Error al cargar las métricas.</div>';
    }
  }

  function buildReportSummary(avisos) {
    const summary = {
      total: avisos.length,
      enviados: 0,
      pendientes: 0,
      fallidos: 0,
      manuales: 0,
      sinWhatsapp: 0,
      manualList: [],
      nowaList: []
    };

    avisos.forEach((aviso) => {
      const status = String(aviso.estado_aviso || '').toLowerCase();
      if (status === 'enviado' || status === 'entregado') summary.enviados += 1;
      else if (status === 'enviado_manual' || status === 'manual') {
        summary.manuales += 1;
        summary.manualList.push(aviso);
      }
      else if (status === 'pendiente') summary.pendientes += 1;
      else if (status === 'fallido' || status === 'error' || status === 'auth_failure') summary.fallidos += 1;
      else if (status === 'sin_whatsapp') {
        summary.sinWhatsapp += 1;
        summary.nowaList.push(aviso);
      }
    });

    return summary;
  }

  function buildReportMarkup(summary) {
    const total = summary.total || 0;
    const procesados = summary.enviados + summary.manuales;
    const pct = total > 0 ? Math.round((procesados / total) * 100) : 0;
    const formatRowForClipboard = (aviso) => {
      const name = aviso.nombre || '-';
      const phone = aviso.telefono || '-';
      const code = aviso.codigo_paquete || '-';
      return `${name}\n   \u2022 Tel\u00e9fono: ${phone}\n   \u2022 C\u00f3digo: ${code}`;
    };

    let manualDetailHtml = '';
    if (summary.manuales > 0) {
      const copyTextFn = (aviso) => `${aviso.nombre || '-'}\t${aviso.telefono || '-'}\t${aviso.codigo_paquete || '-'}`;

      const manualRows = summary.manualList.map((aviso) => `
        <tr>
          <td>${helpers.escapeHtml(aviso.nombre || '-')}</td>
          <td><span class="report-nowa-phone">${helpers.escapeHtml(aviso.telefono || '-')}</span></td>
          <td><span class="report-nowa-code">${helpers.escapeHtml(aviso.codigo_paquete || '-')}</span></td>
          <td>
            <button class="btn-copy-nowa-row" data-copy="${helpers.escapeHtml(copyTextFn(aviso))}" title="Copiar fila">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
          </td>
        </tr>
      `).join('');

      const allManualCopyText = summary.manualList.map((aviso, i) =>
        `${i + 1}. ${formatRowForClipboard(aviso)}`
      ).join('\n\n');

      manualDetailHtml = `
        <div id="reporte-envio-manual-detalle" class="report-nowa-detail" style="display: none;">
          <div class="report-nowa-header">
            <div class="report-nowa-header-left">
              <div class="report-nowa-header-icon">
                <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/><path d="M21 12a9 9 0 1 1-2.64-6.36"/></svg>
              </div>
              <span class="report-nowa-header-title">Env&iacute;os manuales</span>
              <span class="report-nowa-badge">${summary.manuales}</span>
            </div>
            <div class="report-nowa-header-actions">
              ${summary.manuales > 1 ? `
                <button class="btn-copy-nowa-all" data-copy-all="${helpers.escapeHtml(allManualCopyText)}" title="Copiar todos los datos">
                  <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar todo
                </button>
              ` : ''}
            </div>
          </div>
          <div class="report-nowa-table-wrapper">
            <table class="report-nowa-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tel&eacute;fono</th>
                  <th>C&oacute;digo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>${manualRows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    let nowaDetailHtml = '';
    if (summary.sinWhatsapp > 0) {
      const nowaRows = summary.nowaList.map(aviso => {
        const copyText = `${aviso.nombre || '-'}\t${aviso.telefono || '-'}\t${aviso.codigo_paquete || '-'}`;
        return `
          <tr>
            <td>${helpers.escapeHtml(aviso.nombre || '-')}</td>
            <td><span class="report-nowa-phone">${helpers.escapeHtml(aviso.telefono || '-')}</span></td>
            <td><span class="report-nowa-code">${helpers.escapeHtml(aviso.codigo_paquete || '-')}</span></td>
            <td>
              <button class="btn-copy-nowa-row" data-copy="${helpers.escapeHtml(copyText)}" title="Copiar fila">
                <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </td>
          </tr>
        `;
      }).join('');

      const allCopyText = summary.nowaList.map((aviso, i) =>
        `${i + 1}. ${formatRowForClipboard(aviso)}`
      ).join('\n\n');

      const showCopyAll = summary.sinWhatsapp > 1;
      nowaDetailHtml = `
        <div id="reporte-sin-whatsapp-detalle" class="report-nowa-detail" style="display: none;">
          <div class="report-nowa-header">
            <div class="report-nowa-header-left">
              <div class="report-nowa-header-icon">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              </div>
              <span class="report-nowa-header-title">Clientes sin WhatsApp</span>
              <span class="report-nowa-badge">${summary.sinWhatsapp}</span>
            </div>
            <div class="report-nowa-header-actions">
              ${showCopyAll ? `
                <button class="btn-copy-nowa-all" data-copy-all="${helpers.escapeHtml(allCopyText)}" title="Copiar todos los datos">
                  <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copiar todo
                </button>
              ` : ''}
            </div>
          </div>
          <div class="report-nowa-table-wrapper">
            <table class="report-nowa-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Código</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>${nowaRows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    return `
      <div class="report-summary">
        <div class="report-summary-card report-summary-card--total">
          <div class="report-summary-value">${total}</div>
          <div class="report-summary-label">Total registros</div>
        </div>
        <div class="report-summary-card report-summary-card--procesados">
          <div class="report-summary-value">${procesados}</div>
          <div class="report-summary-label">Procesados <span style="font-weight:400; font-family: Outfit;"> · ${pct}%</span></div>
        </div>
      </div>
      <div class="report-divider">Desglose de estados</div>
      <div class="report-breakdown">
        ${buildReportLine('pending', '#d97706', 'Pendientes', summary.pendientes, total)}
        ${buildReportLine('sent', '#15803d', 'Enviados', summary.enviados, total)}
        ${buildReportLine('manual', '#0f766e', 'Envío manual', summary.manuales, total)}
        ${buildReportLine('nowa', '#a855f7', 'Sin WhatsApp', summary.sinWhatsapp, total)}
        ${buildReportLine('fail', '#dc2626', 'Fallidos / errores', summary.fallidos, total, true)}
      </div>
      ${manualDetailHtml}
      ${nowaDetailHtml}
    `;
  }

  function buildReportLine(type, color, label, value, total, isDanger) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    const dangerClass = isDanger ? ' report-item--danger' : '';
    const isClickable = (type === 'nowa' || type === 'manual') && value > 0;
    const detailTarget = type === 'manual'
      ? 'reporte-envio-manual-detalle'
      : (type === 'nowa' ? 'reporte-sin-whatsapp-detalle' : '');
    const clickableClass = isClickable ? ' report-item--clickable' : '';
    return `
      <div class="report-item${dangerClass}${clickableClass}" data-type="${type}" ${isClickable ? `data-detail-target="${detailTarget}"` : ''}>
        <span class="report-item-dot" style="background:${color};"></span>
        <span class="report-item-label" style="display: flex; align-items: center; gap: 6px;">
          ${label}
          ${isClickable ? `
            <svg viewBox="0 0 24 24" class="report-item-chevron" style="width:12px; height:12px; fill:none; stroke:var(--text-muted); stroke-width:3; transition: transform 0.2s ease;">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          ` : ''}
        </span>
        <div class="report-item-bar">
          <div class="report-item-bar-fill" style="width:${pct}%; background:${color};"></div>
        </div>
        <strong class="report-item-value">${value}</strong>
      </div>
    `;
  }

  function bindFilters() {
    const search = document.getElementById('input-buscar');
    const dateFilter = document.getElementById('filter-date');
    const statusFilter = document.getElementById('filter-status');

    const handleFilterChange = () => {
      renderRoutes();
    };

    search?.addEventListener('input', handleFilterChange);
    dateFilter?.addEventListener('change', handleFilterChange);
    statusFilter?.addEventListener('change', handleFilterChange);

    // Enlaces rápidos de cabecera de sección
    document.getElementById('btn-ver-todo-historial')?.addEventListener('click', (e) => {
      e.preventDefault();
      openHistoryModal();
    });
  }

  function bindActionDropdowns() {
    // Cerrar cualquier dropdown abierto si se hace click fuera
    document.addEventListener('click', (event) => {
      const openMenus = document.querySelectorAll('.options-dropdown-menu');
      openMenus.forEach((m) => m.remove());

      const optionsBtn = event.target.closest('.btn-options');
      if (optionsBtn) {
        event.stopPropagation();
        const id = optionsBtn.getAttribute('data-id');
        const name = optionsBtn.getAttribute('data-name');
        const totalPackages = Number(optionsBtn.getAttribute('data-total-packages') || 0);
        const deliveriesEnabled = optionsBtn.getAttribute('data-entregas-enabled') === '1';

        const rect = optionsBtn.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'options-dropdown-menu';
        menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
        menu.style.left = `${rect.right - 190}px`;

        const deliveryDisabled = deliveriesEnabled || totalPackages <= 0 ? 'disabled' : '';
        const deliveryLabel = deliveriesEnabled
          ? 'Ya está en entregas'
          : (totalPackages <= 0 ? 'Sin paquetes para entregas' : 'Enviar a entregas');

        const html = `
          <button class="options-dropdown-item menu-item-entregas ${deliveriesEnabled ? 'is-success' : ''}" data-id="${id}" data-name="${helpers.escapeHtml(name)}" ${deliveryDisabled}>
            <svg viewBox="0 0 24 24"><path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l5 5v2"></path><path d="M14 3v5h5"></path><path d="m16 18 2 2 4-4"></path></svg>
            ${deliveryLabel}
          </button>
          <button class="options-dropdown-item options-dropdown-item--danger menu-item-eliminar" data-id="${id}">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Eliminar ruta
          </button>
        `;

        menu.innerHTML = html;
        document.body.appendChild(menu);

        const menuRect = menu.getBoundingClientRect();
        if (menuRect.bottom > window.innerHeight) {
          menu.style.top = `${rect.top + window.scrollY - menuRect.height - 6}px`;
        }
        if (menuRect.left < 0) {
          menu.style.left = '8px';
        }

        // Bindeos internos
        menu.querySelector('.menu-item-entregas')?.addEventListener('click', async (clickEvent) => {
          clickEvent.stopPropagation();
          const deliveryBtn = clickEvent.currentTarget;
          if (deliveryBtn.disabled) return;
          await publishRouteToDeliveries(id, name, deliveryBtn);
          menu.remove();
        });

        menu.querySelector('.menu-item-eliminar')?.addEventListener('click', async () => {
          menu.remove();
          const ok = window.SharedUI?.confirm
            ? await window.SharedUI.confirm({
              title: 'Eliminar ruta',
              message: `¿Estás seguro de que deseas eliminar permanentemente la ruta «${name}»? Esta acción eliminará la ruta y todos sus envíos de forma irreversible.`,
              confirmText: 'Eliminar',
              type: 'danger'
            })
            : window.confirm(`¿Eliminar permanentemente la ruta "${name}"?`);
          if (!ok) return;

          try {
            await API.Lotes.eliminar(id);
            helpers.showToast('Ruta eliminada correctamente.', 'success');
            await loadRoutes();
          } catch (error) {
            helpers.showToast(error.message || 'No se pudo eliminar la ruta.', 'error');
          }
        });
      }
    });
  }

  async function loadRoutes() {
    const tbodyToday = document.getElementById('tabla-lotes-hoy');
    const tbodyHistory = document.getElementById('tabla-lotes-historial');

    if (tbodyToday) tbodyToday.innerHTML = '<tr><td colspan="7" class="empty-row"><span class="spinner" style="border-top-color:var(--primary)"></span> Cargando rutas...</td></tr>';
    if (tbodyHistory) tbodyHistory.innerHTML = '<tr><td colspan="7" class="empty-row"><span class="spinner" style="border-top-color:var(--text-muted)"></span> Cargando historial...</td></tr>';

    try {
      const response = await API.Lotes.listar();
      state.rutas = response?.data || [];
      updateStatsAndChart();
      renderRoutes();
    } catch (_error) {
      if (tbodyToday) tbodyToday.innerHTML = '<tr><td colspan="7" class="empty-row error-row"><div class="empty-icon-box"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div>Error al cargar las rutas del servidor.</div></td></tr>';
      if (tbodyHistory) tbodyHistory.innerHTML = '<tr><td colspan="7" class="empty-row error-row"><div class="empty-icon-box"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div>Error al cargar el historial del servidor.</div></td></tr>';
    }
  }

  function renderRoutes() {
    const tbodyToday = document.getElementById('tabla-lotes-hoy');
    const tbodyHistory = document.getElementById('tabla-lotes-historial');
    if (!tbodyToday || !tbodyHistory) return;

    // Capturar valores de filtros
    const query = document.getElementById('input-buscar')?.value.trim().toLowerCase() || '';
    const dateFilter = document.getElementById('filter-date')?.value || 'todos';
    const statusFilter = document.getElementById('filter-status')?.value || 'todos';

    const todayKey = getTodayKey();
    const yesterdayKey = getYesterdayKey();

    // 1. Filtrar lista total
    const filteredRoutes = state.rutas.filter((item) => {
      // Filtro de Texto
      if (query) {
        const haystack = [
          item.nombre_lote,
          item.origen,
          item.sede_nombre,
          item.zona
        ].map((value) => String(value || '').toLowerCase()).join(' ');
        if (!haystack.includes(query)) return false;
      }

      // Filtro de Fecha
      if (dateFilter === 'hoy') {
        if (!String(item.fecha || '').startsWith(todayKey)) return false;
      } else if (dateFilter === 'ayer') {
        if (!String(item.fecha || '').startsWith(yesterdayKey)) return false;
      } else if (dateFilter === '7d') {
        const routeDate = new Date(item.fecha);
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 7);
        if (routeDate < limitDate) return false;
      }

      // Filtro de Estado
      if (statusFilter !== 'todos') {
        const itemStatus = String(item.estado || 'pendiente').toLowerCase();
        if (statusFilter === 'pendiente') {
          if (itemStatus !== 'pendiente' && itemStatus !== 'borrador') return false;
        } else if (statusFilter === 'procesando') {
          if (itemStatus !== 'procesando') return false;
        } else if (statusFilter === 'completado') {
          if (itemStatus !== 'completado') return false;
        } else if (statusFilter === 'pausado') {
          if (itemStatus !== 'pausado') return false;
        } else if (statusFilter === 'cancelado') {
          if (itemStatus !== 'cancelado') return false;
        }
      }

      return true;
    });

    const sortedRoutes = filteredRoutes.slice().sort(compareRoutesNewestFirst);

    // 2. Dividir en Hoy e Historial manteniendo orden estable: más reciente primero.
    const routesToday = sortedRoutes.filter((route) => String(route.fecha || '').startsWith(todayKey));
    const routesHistory = sortedRoutes.filter((route) => !String(route.fecha || '').startsWith(todayKey));

    // Actualizar badges de conteo en la cabecera
    helpers.setText('today-count-badge', `${routesToday.length} ruta${routesToday.length === 1 ? '' : 's'}`);
    helpers.setText('history-count-badge', `${routesHistory.length} ruta${routesHistory.length === 1 ? '' : 's'}`);

    const limitedToday = routesToday.slice(0, 5);
    let todayRowsHtml = '';
    if (routesToday.length > 0) {
      todayRowsHtml = limitedToday.map((route, index) => renderRouteRow(route, index, true)).join('');
      if (routesToday.length > 5) {
        todayRowsHtml += `
          <tr>
            <td colspan="7" style="text-align: center; padding: 14px; background: var(--border-light); border-top: 1px solid var(--border-color);">
              <div style="display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;">
                <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">Mostrando 5 de ${routesToday.length} rutas de hoy</span>
                <button type="button" class="btn-ver-mas-historial" id="btn-ver-mas-hoy-table">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align: middle;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  Ver todas las rutas de hoy
                </button>
              </div>
            </td>
          </tr>
        `;
      }
    } else {
      todayRowsHtml = '<tr><td colspan="7" class="empty-row"><div class="empty-icon-box"><svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><div>No hay rutas registradas hoy.</div></td></tr>';
    }

    tbodyToday.innerHTML = todayRowsHtml;

    const limitedHistory = routesHistory.slice(0, 5);
    let historyRowsHtml = '';
    if (routesHistory.length > 0) {
      historyRowsHtml = limitedHistory.map((route, index) => renderRouteRow(route, index, false)).join('');
    } else {
      historyRowsHtml = '<tr><td colspan="7" class="empty-row"><div class="empty-icon-box"><svg viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><div>No hay historial de rutas anteriores.</div></td></tr>';
    }

    tbodyHistory.innerHTML = historyRowsHtml;

    // Bindiar los nuevos botones si existen
    document.getElementById('btn-ver-mas-hoy-table')?.addEventListener('click', openHistoryModal);
    document.getElementById('btn-ver-mas-historial-table')?.addEventListener('click', openHistoryModal);

    // Si el modal está abierto, refrescar su contenido
    if (document.getElementById('modal-historial-completo')?.classList.contains('open')) {
      renderHistoryModalList();
    }
  }

  function bindHistoryModal() {
    const modal = document.getElementById('modal-historial-completo');
    const closeBtn = document.getElementById('btn-cerrar-historial-completo');
    const searchInput = document.getElementById('input-buscar-historial');

    const closeModal = () => {
      modal?.classList.remove('open');
      if (searchInput) searchInput.value = '';
    };

    closeBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    searchInput?.addEventListener('input', () => {
      renderHistoryModalList();
    });
  }

  function openHistoryModal() {
    const modal = document.getElementById('modal-historial-completo');
    if (!modal) return;

    modal.classList.add('open');
    document.getElementById('input-buscar-historial')?.focus();
    renderHistoryModalList();
  }

  function renderHistoryModalList() {
    const tbodyModal = document.getElementById('tabla-lotes-historial-modal');
    if (!tbodyModal) return;

    const query = document.getElementById('input-buscar-historial')?.value.trim().toLowerCase() || '';

    // Mostrar todos los elementos del historial (rutas de hoy + anteriores)
    const allRoutes = state.rutas.slice().sort(compareRoutesNewestFirst);

    // Filtrar localmente en base al buscador del modal
    const filtered = allRoutes.filter((item) => {
      if (!query) return true;
      const haystack = [
        item.nombre_lote,
        item.origen,
        item.sede_nombre,
        item.zona,
        formatStatus(item.estado)
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(query);
    });

    // Calcular estadísticas
    const totalRutas = filtered.length;
    const totalPaquetes = filtered.reduce((acc, item) => acc + Number(item.total_registros || 0), 0);
    const promedio = totalRutas > 0 ? Math.round(totalPaquetes / totalRutas) : 0;

    helpers.setText('hist-total-rutas', totalRutas);
    helpers.setText('hist-total-paquetes', totalPaquetes);
    helpers.setText('hist-promedio-paquetes', promedio);

    if (filtered.length === 0) {
      tbodyModal.innerHTML = '<tr><td colspan="7" class="empty-row"><div class="empty-icon-box"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><div>No se encontraron rutas que coincidan con la búsqueda.</div></td></tr>';
      return;
    }

    tbodyModal.innerHTML = filtered.slice().sort(compareRoutesNewestFirst).map((route, index) => {
      const todayKey = getTodayKey();
      const isToday = String(route.fecha || '').startsWith(todayKey);
      return renderRouteRow(route, index, isToday);
    }).join('');
  }

  function renderRouteRow(route, index, isToday = true) {
    const nombre = route.nombre_lote || 'Ruta sin nombre';
    const nombreEditable = getEditableRouteName(nombre);
    const estado = String(route.estado || 'pendiente').toLowerCase();
    const estadoClass = estado === 'borrador' ? 'pendiente' : estado;
    const uniqueCode = `MYG-${route.id}`;
    const zona = route.zona || route.nombre_lote || '-';
    const totalPaquetes = Number(route.total_registros || 0);
    const entregasHabilitado = Number(route.entregas_habilitado || 0) === 1;
    const displayDate = isToday
      ? (route.created_at || route.fecha)
      : (route.fecha_finalizacion || route.finished_at || route.updated_at || route.created_at || route.fecha);

    const actionMenuButton = `
      <button class="btn-action-premium btn-options" data-id="${route.id}" data-name="${helpers.escapeHtml(nombre)}" data-base-name="${helpers.escapeHtml(nombreEditable)}" data-is-today="${isToday}" data-total-packages="${totalPaquetes}" data-entregas-enabled="${entregasHabilitado ? '1' : '0'}" title="Opciones">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>
    `;

    let actionsHtml = '';
    if (isToday) {
      actionsHtml = `
        <div class="action-buttons">
          <button class="btn-action-premium btn-reporte" data-id="${route.id}" title="Ver reporte">
            <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </button>
          <button class="btn-action-premium btn-editar" data-id="${route.id}" data-base-name="${helpers.escapeHtml(nombreEditable)}" title="Editar nombre">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${actionMenuButton}
          <a href="${API.Routes.loteDetalle(route.id, nombre)}" class="btn-action-premium btn-ver-detalle" title="Ver detalle">
            Ver detalle
          </a>
        </div>
      `;
    } else {
      actionsHtml = `
        <div class="action-buttons">
          <button class="btn-action-premium btn-reporte" data-id="${route.id}" title="Ver reporte">
            <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </button>
          ${actionMenuButton}
          <a href="${API.Routes.loteDetalle(route.id, nombre)}" class="btn-action-premium btn-ver-detalle" title="Ver detalle">
            Ver detalle
          </a>
        </div>
      `;
    }

    return `
      <tr data-id="${route.id}">
        <td class="col-num"><span class="route-id-badge">${index + 1}</span></td>
        <td class="col-route-code">
          <span>${helpers.escapeHtml(uniqueCode)}</span>
        </td>
        <td class="col-route-name">
          ${helpers.escapeHtml(zona)}
        </td>
        <td class="col-paquetes">${Number(route.total_registros || 0)}</td>
        <td>
          <span class="estado-badge estado-${helpers.escapeHtml(estadoClass)}">
            ${formatStatus(estado)}
          </span>
        </td>
        <td class="col-date">
          ${formatDateTime(displayDate)}
        </td>
        <td>
          ${actionsHtml}
        </td>
      </tr>
    `;
  }
});
