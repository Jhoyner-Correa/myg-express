// ============================================================
// savar-scan.js - Lógica cliente de la pantalla principal de escaneo
// ============================================================

(function () {
  'use strict';

  // Sobrescribir showToast localmente solo para la pantalla de SAVAR SCAN
  if (window.SharedUI && typeof window.SharedUI.showToast === 'function') {
    const originalShowToast = window.SharedUI.showToast;
    window.SharedUI.showToast = function (message, type, options = {}) {
      // Forzar una duración rápida de 1.5 segundos (1500ms)
      options.durationMs = 1500;
      // Limpiar toasts anteriores para evitar acumulaciones duplicadas/triplicadas
      const container = document.getElementById('sui-toast-container');
      if (container) {
        container.innerHTML = '';
      }
      return originalShowToast(message, type, options);
    };
  }

  // Sonidos sintetizados nativamente (Web Audio API)
  const AudioHelper = {
    ctx: null,

    init() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },

    playTone(frequency, duration, type = 'sine', sweepTo = null) {
      try {
        this.init();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        
        if (sweepTo) {
          osc.frequency.exponentialRampToValueAtTime(sweepTo, this.ctx.currentTime + duration);
        }

        // Aumentar volumen inicial a 0.8 para ambientes de almacén ruidosos
        gain.gain.setValueAtTime(0.8, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (err) {
        console.warn('Web Audio API error:', err);
      }
    },

    beepExito() {
      // Arpegio ascendente brillante y limpio (E5 -> A5) - Tono de confirmación premium
      this.playTone(659.25, 0.07, 'sine');
      setTimeout(() => {
        this.playTone(880.00, 0.15, 'sine');
      }, 60);
    },

    beepAdvertencia() {
      // Sonido escandaloso y potente de patito de goma / pollo de juguete (Squeak-Squeak)
      try {
        this.init();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }

        const playSqueak = () => {
          const osc = this.ctx.createOscillator();
          const gainNode = this.ctx.createGain();

          // Usamos onda triangular para emular la resonancia plástica del silbato del juguete
          osc.type = 'triangle';
          
          const now = this.ctx.currentTime;
          
          // Fase 1: Presión (Ascenso rápido y agudo)
          osc.frequency.setValueAtTime(550, now);
          osc.frequency.exponentialRampToValueAtTime(1600, now + 0.08);

          gainNode.gain.setValueAtTime(0.85, now);
          gainNode.gain.setValueAtTime(0.85, now + 0.06);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

          osc.connect(gainNode);
          gainNode.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.13);
        };

        const playRelease = () => {
          const osc = this.ctx.createOscillator();
          const gainNode = this.ctx.createGain();

          osc.type = 'triangle';
          
          const now = this.ctx.currentTime;

          // Fase 2: Liberación (Descenso un poco más largo y cómico)
          osc.frequency.setValueAtTime(1500, now);
          osc.frequency.exponentialRampToValueAtTime(800, now + 0.12);

          gainNode.gain.setValueAtTime(0.75, now);
          gainNode.gain.setValueAtTime(0.75, now + 0.08);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

          osc.connect(gainNode);
          gainNode.connect(this.ctx.destination);

          osc.start(now);
          osc.stop(now + 0.16);
        };

        // Secuencia consecutiva del chillido (Presionar -> Soltar)
        playSqueak();
        setTimeout(() => {
          playRelease();
        }, 90);

      } catch (err) {
        console.warn('Toy squeak sound error:', err);
      }
    },

    beepError() {
      // Zumbador industrial desafinado de máxima potencia (3 osciladores en paralelo)
      try {
        this.init();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }

        const playBuzzer = (freq, duration) => {
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const osc3 = this.ctx.createOscillator();
          const gainNode = this.ctx.createGain();

          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(freq, this.ctx.currentTime);

          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(freq + 4, this.ctx.currentTime); // Desafinado para generar batido sónico

          osc3.type = 'square';
          osc3.frequency.setValueAtTime(freq * 2, this.ctx.currentTime); // Armónico de octava cuadrada súper penetrante

          gainNode.gain.setValueAtTime(0.8, this.ctx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

          osc1.connect(gainNode);
          osc2.connect(gainNode);
          osc3.connect(gainNode);
          gainNode.connect(this.ctx.destination);

          osc1.start();
          osc2.start();
          osc3.start();
          osc1.stop(this.ctx.currentTime + duration);
          osc2.stop(this.ctx.currentTime + duration);
          osc3.stop(this.ctx.currentTime + duration);
        };

        // Alerta industrial doble de alto impacto (Zumbidos consecutivos de 140Hz y 130Hz)
        playBuzzer(140, 0.25);
        setTimeout(() => {
          playBuzzer(130, 0.38);
        }, 280);
      } catch (err) {
        console.warn('Web Audio API error:', err);
      }
    }
  };

  // State local de la pantalla
  const State = {
    history: [],          // Historial de la sesión actual
    lotes: [],            // Lotes cargados en el sistema
    loteActivo: '',       // Nombre del lote de carga activo
    faltantes: [],        // Paquetes faltantes del lote activo
    incidenciasCount: 0,  // Conteo de incidencias en esta sesión
    user: null,
    importModal: null,
    faltantesModal: null,
    filtrarZonasModal: null
  };

  // Referencias DOM
  const Elements = {
    scanInput: null,
    statusCard: null,
    statusTitle: null,
    statusSubtitle: null,
    
    // Ficha
    infoCodigo: null,
    infoConsignado: null,
    infoDireccion: null,
    infoTelefono: null,
    infoDepartamento: null,
    infoProvincia: null,
    infoDistrito: null,
    
    // Historial
    historyBody: null,
    totalScannedCount: null,
    
    // Controles
    btnOpenImport: null,
    btnResetScans: null,
    btnExportScans: null,
    
    // Lote Activo Panel
    loteActiveLabel: null,
    btnVerFaltantes: null,
    loteTotalCount: null,
    loteRecibidosCount: null,
    loteFaltantesCount: null,
    loteIncidenciasCount: null,
    loteProgressBar: null,
    loteProgressPct: null,
    loteCompleteBanner: null,
    
    // Modales
    modalImport: null,
    inputLoteNombre: null,
    dropzone: null,
    fileInput: null,
    modalFiltrarZonas: null,
    filterModalFilename: null,
    filterModalTotalCount: null,
    importFiltersList: null,
    btnImportCancelFile: null,
    btnImportSubmitFiltered: null,
    btnZoneSelectAll: null,
    btnZoneSelectNone: null,
    importZoneSearch: null,
    
    modalFaltantes: null,
    filterFaltantes: null,
    faltantesTableBody: null,

    // Reportes & Tabs
    tabButtons: [],
    tabContents: [],
    filterReportesLotes: null,
    filterReportesMes: null,
    btnExportConsolidado: null,
    reportesLotesBody: null
  };

  const MESES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  function getColumnValue(row, aliases) {
    const match = Object.keys(row || {}).find((key) =>
      aliases.some((alias) => {
        const normKey = String(key).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
        const normAlias = String(alias).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
        return normKey.includes(normAlias);
      })
    );
    return match ? String(row[match] || '').trim() : '';
  }

  // Inicializar referencias DOM
  function initDOMElements() {
    Elements.scanInput = document.getElementById('scan-input');
    Elements.statusCard = document.getElementById('scan-status-card');
    Elements.statusTitle = document.getElementById('status-badge-title');
    Elements.statusSubtitle = document.getElementById('status-badge-subtitle');
    
    Elements.infoCodigo = document.getElementById('info-codigo');
    Elements.infoConsignado = document.getElementById('info-consignado');
    Elements.infoDireccion = document.getElementById('info-direccion');
    Elements.infoTelefono = document.getElementById('info-telefono');
    Elements.infoDepartamento = document.getElementById('info-departamento');
    Elements.infoProvincia = document.getElementById('info-provincia');
    Elements.infoDistrito = document.getElementById('info-distrito');
    
    Elements.historyBody = document.getElementById('scan-history-body');
    Elements.totalScannedCount = document.getElementById('total-scanned-count');
    
    Elements.btnOpenImport = document.getElementById('btn-open-import');
    Elements.btnResetScans = document.getElementById('btn-reset-scans');
    Elements.btnExportScans = document.getElementById('btn-export-scans');
    
    // Lote panel
    Elements.loteActiveLabel = document.getElementById('lote-activo-label');
    Elements.btnVerFaltantes = document.getElementById('btn-ver-faltantes');
    Elements.loteTotalCount = document.getElementById('lote-total-count');
    Elements.loteRecibidosCount = document.getElementById('lote-recibidos-count');
    Elements.loteFaltantesCount = document.getElementById('lote-faltantes-count');
    Elements.loteIncidenciasCount = document.getElementById('lote-incidencias-count');
    Elements.loteProgressBar = document.getElementById('lote-progress-bar');
    Elements.loteProgressPct = document.getElementById('lote-progress-pct');
    Elements.loteCompleteBanner = document.getElementById('lote-complete-banner');
    
    // Import Modal
    Elements.modalImport = document.getElementById('modal-importar');
    Elements.inputLoteNombre = document.getElementById('input-lote-nombre');
    Elements.dropzone = document.getElementById('import-dropzone');
    Elements.fileInput = document.getElementById('file-input-excel');
    
    // Filtrar Zonas Modal
    Elements.modalFiltrarZonas = document.getElementById('modal-filtrar-zonas');
    Elements.filterModalFilename = document.getElementById('filter-modal-filename');
    Elements.filterModalTotalCount = document.getElementById('filter-modal-total-count');
    Elements.importFiltersList = document.getElementById('import-filters-list');
    Elements.btnImportCancelFile = document.getElementById('btn-import-cancel-file');
    Elements.btnImportSubmitFiltered = document.getElementById('btn-import-submit-filtered');
    Elements.btnZoneSelectAll = document.getElementById('btn-zone-select-all');
    Elements.btnZoneSelectNone = document.getElementById('btn-zone-select-none');
    Elements.importZoneSearch = document.getElementById('import-zone-search');
    
    // Faltantes Modal
    Elements.modalFaltantes = document.getElementById('modal-faltantes');
    Elements.filterFaltantes = document.getElementById('filter-faltantes');
    Elements.faltantesTableBody = document.getElementById('faltantes-table-body');

    // Reportes & Tabs
    Elements.tabButtons = Array.from(document.querySelectorAll('.scan-tab-btn'));
    Elements.tabContents = Array.from(document.querySelectorAll('.tab-content'));
    Elements.filterReportesLotes = document.getElementById('filter-reportes-lotes');
    Elements.filterReportesMes = document.getElementById('filter-reportes-mes');
    Elements.btnExportConsolidado = document.getElementById('btn-export-consolidado');
    Elements.reportesLotesBody = document.getElementById('reportes-lotes-body');
  }

  // Foco automático persistente
  function setupAutoFocus() {
    document.addEventListener('click', function (e) {
      // Si el usuario está seleccionando o ha seleccionado texto en la pantalla, permitir copiar libremente
      if (window.getSelection() && window.getSelection().toString().trim() !== '') {
        return;
      }

      if (
        e.target.tagName === 'BUTTON' ||
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'SELECT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'A' ||
        e.target.closest('button') ||
        e.target.closest('a') ||
        e.target.closest('.ss-btn') ||
        e.target.closest('.sui-confirm-dialog') ||
        e.target.closest('.scan-tabs') ||
        e.target.closest('.row-actions') ||
        Elements.modalImport?.classList.contains('open') ||
        Elements.modalFaltantes?.classList.contains('open')
      ) {
        return;
      }
      focusInput();
    });
  }

  function focusInput() {
    if (Elements.scanInput) {
      Elements.scanInput.focus();
    }
  }

  // Limpiar pantalla a estado neutral
  function resetDisplay() {
    Elements.statusCard.className = 'ss-status-card state-neutral';
    Elements.statusTitle.textContent = 'ESPERANDO';
    Elements.statusSubtitle.textContent = 'Escanee un codigo de barras para comenzar';
    
    resetFichaValues();
    Elements.scanInput.value = '';
    focusInput();
  }

  function resetFichaValues() {
    Elements.infoCodigo.textContent = '—';
    Elements.infoConsignado.textContent = '—';
    Elements.infoDireccion.textContent = '—';
    Elements.infoTelefono.textContent = '—';
    Elements.infoDepartamento.textContent = '—';
    Elements.infoProvincia.textContent = '—';
    Elements.infoDistrito.textContent = '—';
  }

  // Cargar lista de lotes e inicializar selector
  async function cargarLotes(seleccionarUltimo = false) {
    try {
      const response = await fetch('/api/savar-scan/lotes', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const res = await response.json();
      
      if (response.ok && Array.isArray(res.data)) {
        State.lotes = res.data;
        
        if (seleccionarUltimo) {
          const hoyLocal = new Date().toLocaleDateString('es-PE');
          // Buscar si hay algún lote cargado hoy (comparando la fecha de creación del lote con el día actual)
          const loteHoy = res.data.find(l => {
            if (!l.fecha_creacion) return false;
            return new Date(l.fecha_creacion).toLocaleDateString('es-PE') === hoyLocal;
          });

          if (loteHoy) {
            State.loteActivo = loteHoy.nombre;
          } else if (res.data.length > 0) {
            // Si no hay de hoy, tomar la carga más reciente por defecto
            State.loteActivo = res.data[0].nombre;
          }
        }

        actualizarIndicadoresLote();
        populateMonthFilter();
        renderReportesLotes();
      }
    } catch (err) {
      console.error('Error al cargar lotes:', err);
    }
  }

  // Actualizar indicadores visuales de progreso del lote seleccionado
  function actualizarIndicadoresLote() {
    const lote = State.lotes.find(l => l.nombre === State.loteActivo);

    if (!lote) {
      // Estado vacío/sin lote
      Elements.loteActiveLabel.textContent = 'Ninguno (Suba un Excel)';
      Elements.loteTotalCount.textContent = '0';
      Elements.loteRecibidosCount.textContent = '0';
      Elements.loteFaltantesCount.textContent = '0';
      Elements.loteIncidenciasCount.textContent = '0';
      Elements.loteProgressBar.style.width = '0%';
      Elements.loteProgressPct.textContent = '0%';
      Elements.loteCompleteBanner.style.display = 'none';
      Elements.btnVerFaltantes.disabled = true;
      return;
    }

    Elements.loteActiveLabel.textContent = State.loteActivo;
    Elements.btnVerFaltantes.disabled = false;
    
    // Estadísticas
    const total = Number(lote.total || 0);
    const recibidos = Number(lote.recibidos || 0);
    const faltantes = Math.max(0, total - recibidos);
    
    Elements.loteTotalCount.textContent = total;
    Elements.loteRecibidosCount.textContent = recibidos;
    Elements.loteFaltantesCount.textContent = faltantes;
    Elements.loteIncidenciasCount.textContent = State.incidenciasCount;

    // Barra progreso
    const pct = total > 0 ? Math.round((recibidos / total) * 100) : 0;
    Elements.loteProgressBar.style.width = `${pct}%`;
    Elements.loteProgressPct.textContent = `${pct}%`;

    // Banner Carga Completa
    if (total > 0 && recibidos === total) {
      Elements.loteCompleteBanner.style.display = 'block';
    } else {
      Elements.loteCompleteBanner.style.display = 'none';
    }
  }

  // Cargar paquetes faltantes para el modal
  async function cargarFaltantes() {
    if (!State.loteActivo) return;

    try {
      const response = await fetch(`/api/savar-scan/faltantes?lote=${encodeURIComponent(State.loteActivo)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const res = await response.json();
      
      if (response.ok && Array.isArray(res.data)) {
        State.faltantes = res.data;
        renderFaltantes();
      }
    } catch (err) {
      console.error('Error al cargar faltantes:', err);
    }
  }

  // Renderizar tabla de faltantes en el modal
  function renderFaltantes() {
    const query = String(Elements.filterFaltantes.value || '').toLowerCase().trim();
    
    const filtered = State.faltantes.filter(item => {
      return (
        String(item.codigo_paquete || '').toLowerCase().includes(query) ||
        String(item.consignado || '').toLowerCase().includes(query) ||
        String(item.direccion || '').toLowerCase().includes(query) ||
        String(item.distrito || '').toLowerCase().includes(query)
      );
    });

    if (filtered.length === 0) {
      Elements.faltantesTableBody.innerHTML = `
        <tr>
          <td colspan="4" class="empty-row">
            Ningun paquete pendiente de recibir coincide.
          </td>
        </tr>
      `;
      return;
    }

    Elements.faltantesTableBody.innerHTML = filtered.map(item => `
      <tr>
        <td class="code-font">${item.codigo_paquete}</td>
        <td>${item.consignado}</td>
        <td>${item.direccion || '—'}</td>
        <td style="white-space: nowrap;">${item.distrito || '—'}</td>
      </tr>
    `).join('');
  }

  // Rellenar selector de meses en base a las fechas de los lotes cargados
  function populateMonthFilter() {
    const optionsMap = new Map();

    State.lotes.forEach(l => {
      if (!l.fecha_creacion) return;
      const date = new Date(l.fecha_creacion);
      const year = date.getFullYear();
      const month = date.getMonth(); // 0-11
      const key = `${month + 1}/${year}`;
      const label = `${MESES_ES[month]} ${year}`;
      
      optionsMap.set(key, label);
    });

    const activeSel = Elements.filterReportesMes.value;
    Elements.filterReportesMes.innerHTML = '<option value="">Todos los meses</option>' + 
      Array.from(optionsMap.entries()).map(([key, label]) => {
        return `<option value="${key}">${label}</option>`;
      }).join('');
    
    if (activeSel) {
      Elements.filterReportesMes.value = activeSel;
    }
  }

  // Renderizar la tabla de Historial de Cargas y Reportes
  function renderReportesLotes() {
    const query = String(Elements.filterReportesLotes.value || '').toLowerCase().trim();
    const mesFiltro = Elements.filterReportesMes.value; // e.g. "7/2026"

    const filtered = State.lotes.filter(item => {
      // Filtrar por texto
      const matchText = String(item.nombre || '').toLowerCase().includes(query);
      if (!matchText) return false;

      // Filtrar por mes
      if (mesFiltro) {
        if (!item.fecha_creacion) return false;
        const date = new Date(item.fecha_creacion);
        const itemMesFiltro = `${date.getMonth() + 1}/${date.getFullYear()}`;
        return itemMesFiltro === mesFiltro;
      }

      return true;
    });

    if (filtered.length === 0) {
      Elements.reportesLotesBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-row" style="text-align:center;color:var(--text-muted);font-style:italic;padding:25px;">
            No se encontraron lotes de carga registrados.
          </td>
        </tr>
      `;
      return;
    }

    Elements.reportesLotesBody.innerHTML = filtered.map(item => {
      const dateStr = item.fecha_creacion ? new Date(item.fecha_creacion).toLocaleDateString('es-PE') : '—';
      const total = Number(item.total || 0);
      const recibidos = Number(item.recibidos || 0);
      const pendientes = Math.max(0, total - recibidos);
      const pct = total > 0 ? Math.round((recibidos / total) * 100) : 0;

      return `
        <tr>
          <td><span style="font-weight: 700; color: #1e293b;">${item.nombre}</span></td>
          <td style="color: #64748b; font-weight: 500;">${dateStr}</td>
          <td style="text-align: center; font-weight: 600; color: #1e3a8a;">${total}</td>
          <td style="text-align: center; color: #15803d; font-weight: 700;">${recibidos}</td>
          <td style="text-align: center; color: #b45309; font-weight: 700;">${pendientes}</td>
          <td>
            <div class="mini-progress-container">
              <div class="mini-progress-bg">
                <div class="mini-progress-bar" style="width: ${pct}%;"></div>
              </div>
              <div class="mini-progress-pct">${pct}%</div>
            </div>
          </td>
          <td>
            <div class="row-actions">
              <button type="button" class="btn-row-action action-activate" title="Activar lote para escaneo" data-lote="${item.nombre}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 12H4M12 4v16"/>
                </svg>
              </button>
              <button type="button" class="btn-row-action action-export" title="Descargar recibidos" data-lote="${item.nombre}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
              </button>
              <button type="button" class="btn-row-action action-missing" title="Exportar faltantes" data-lote="${item.nombre}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
              </button>
              <button type="button" class="btn-row-action action-delete" title="Eliminar lote y paquetes" data-lote="${item.nombre}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Renderizar historial de la sesión
  function renderHistory() {
    if (!Elements.historyBody) return;
    
    if (State.history.length === 0) {
      Elements.historyBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-row">
            No se han registrado escaneos en esta sesion.
          </td>
        </tr>
      `;
      Elements.totalScannedCount.textContent = '0';
      return;
    }

    Elements.totalScannedCount.textContent = State.history.length;

    Elements.historyBody.innerHTML = State.history.map((item, index) => {
      const isSuccess = item.estado === 'LLEGÓ';
      const isDuplicate = item.estado === 'DUPLICADO';
      const isOtherLote = item.estado === 'OTRO_LOTE';
      
      let badgeClass = 'ss-badge error';
      let badgeText = 'NO EXISTE';
      if (isSuccess) {
        badgeClass = 'ss-badge success';
        badgeText = 'LLEGO';
      } else if (isDuplicate) {
        badgeClass = 'ss-badge warning';
        badgeText = 'REPETIDO';
      } else if (isOtherLote) {
        badgeClass = 'ss-badge warning';
        badgeText = 'OTRO LOTE';
      }

      return `
        <tr>
          <td><strong>${index + 1}</strong></td>
          <td class="code-font">${item.codigo_paquete || item.codigo_escaneado}</td>
          <td>${item.consignado || '—'}</td>
          <td>${item.direccion || '—'}</td>
          <td>${item.distrito || '—'}</td>
          <td><span class="${badgeClass}">${badgeText}</span></td>
          <td>${new Date(item.fecha_escaneo || item.fecha || Date.now()).toLocaleTimeString('es-PE')}</td>
        </tr>
      `;
    }).join('');
  }

  // Agregar escaneo a historial
  function pushToHistory(item) {
    State.history.unshift(item);
    if (State.history.length > 50) {
      State.history.pop();
    }
    renderHistory();
  }

  // Procesar escaneo individual
  async function handleScan(codigo) {
    if (!codigo) return;
    
    if (!State.loteActivo) {
      SharedUI.showToast('Por favor, seleccione o cargue un Lote de Carga Activo antes de escanear.', 'warning', { title: 'Lote no seleccionado' });
      focusInput();
      return;
    }

    Elements.scanInput.disabled = true;

    try {
      const response = await fetch('/api/savar-scan/procesar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ codigo, lote_activo: State.loteActivo })
      });

      const res = await response.json();

      if (response.ok) {
        // 200 OK: Llegó
        AudioHelper.beepExito();
        
        Elements.statusCard.className = 'ss-status-card state-success';
        Elements.statusTitle.textContent = 'LLEGO';
        Elements.statusSubtitle.textContent = `Paquete registrado con exito en lote "${State.loteActivo}".`;
        
        populateFicha(res.data);
        pushToHistory(res.data);

        // Recargar estadísticas de lotes
        await cargarLotes();

        Elements.scanInput.value = '';

      } else if (response.status === 422) {
        // 422: Pertenece a otro lote de importación
        AudioHelper.beepAdvertencia();

        Elements.statusCard.className = 'ss-status-card state-other-lote';
        Elements.statusTitle.textContent = 'OTRO LOTE';
        Elements.statusSubtitle.textContent = res.message || 'El paquete pertenece a otro lote de carga.';

        if (res.data) {
          populateFicha(res.data);
          pushToHistory({
            ...res.data,
            estado: 'OTRO_LOTE',
            fecha_escaneo: new Date().toISOString()
          });
        }
        
        State.incidenciasCount++;
        actualizarIndicadoresLote();
        Elements.scanInput.value = '';

      } else if (response.status === 409) {
        // 409: Duplicado en el mismo lote
        AudioHelper.beepAdvertencia();

        Elements.statusCard.className = 'ss-status-card state-warning';
        Elements.statusTitle.textContent = 'REPETIDO';
        Elements.statusSubtitle.textContent = res.message || 'Este codigo ya fue escaneado.';

        if (res.data) {
          populateFicha(res.data);
          // Ojo: según requerimiento, el código repetido no se registra en la lista de escaneos de la sesión.
        }
        
        State.incidenciasCount++;
        actualizarIndicadoresLote();
        Elements.scanInput.select();

      } else if (response.status === 404) {
        // 404: No existe en ningún lote
        AudioHelper.beepError();

        Elements.statusCard.className = 'ss-status-card state-error';
        Elements.statusTitle.textContent = 'NO EXISTE';
        Elements.statusSubtitle.textContent = 'El codigo no existe en la lista del sistema.';

        resetFichaValues();
        Elements.infoCodigo.textContent = codigo;
        
        // Ojo: según requerimiento, el código inexistente no se registra en la lista de escaneos de la sesión.

        State.incidenciasCount++;
        actualizarIndicadoresLote();
        Elements.scanInput.value = '';
      } else {
        throw new Error(res.message || 'Error desconocido.');
      }

    } catch (err) {
      console.error('Scan error:', err);
      AudioHelper.beepError();
      SharedUI.showToast(err.message || 'Error de red al conectar con el servidor.', 'error', { title: 'Error de escaneo' });
      Elements.scanInput.value = '';
    } finally {
      Elements.scanInput.disabled = false;
      focusInput();
    }
  }

  // Rellenar ficha
  function populateFicha(data) {
    Elements.infoCodigo.textContent = data.codigo_paquete || '—';
    Elements.infoConsignado.textContent = data.consignado || '—';
    Elements.infoDireccion.textContent = data.direccion || '—';
    Elements.infoTelefono.textContent = data.telefono || '—';
    Elements.infoDepartamento.textContent = data.departamento || '—';
    Elements.infoProvincia.textContent = data.provincia || '—';
    Elements.infoDistrito.textContent = data.distrito || '—';
  }

  // Cargar historial inicial del día desde el servidor
  async function cargarHistorialInicial() {
    try {
      const response = await fetch('/api/savar-scan/paquetes?estado=LLEGÓ&limit=50', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const res = await response.json();
      if (response.ok && Array.isArray(res.data)) {
        State.history = res.data;
        renderHistory();
      }
    } catch (err) {
      console.warn('No se pudo cargar el historial inicial:', err);
    }
  }

  // Restablecer los escaneos
  async function actionResetScans() {
    if (!State.loteActivo) {
      SharedUI.showToast('Debe seleccionar un lote activo para restablecer.', 'warning');
      return;
    }

    const confirm = await SharedUI.confirm({
      title: 'Restablecer escaneos',
      message: `¿Estás seguro de que deseas restablecer TODOS los paquetes escaneados del lote "${State.loteActivo}" a estado PENDIENTE?`,
      confirmText: 'Sí, Restablecer',
      cancelText: 'Cancelar',
      type: 'danger'
    });

    if (!confirm) return;

    try {
      const response = await fetch(`/api/savar-scan/reset?lote=${encodeURIComponent(State.loteActivo)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const res = await response.json();

      if (response.ok) {
        SharedUI.showToast(res.message || 'Escaneos restablecidos con exito.', 'success');
        State.history = [];
        State.incidenciasCount = 0;
        renderHistory();
        resetDisplay();
        await cargarLotes();
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      SharedUI.showToast(err.message || 'Error al restablecer los escaneos.', 'error');
    }
  }

  // Exportar escaneos a Excel (Activo)
  async function actionExportScans() {
    if (!State.loteActivo) {
      SharedUI.showToast('Seleccione un lote de carga activo para exportar.', 'warning');
      return;
    }
    await exportarExcelPorLote(State.loteActivo, 'LLEGÓ');
  }

  // Exportar reporte de un lote específico (LLEGÓ o PENDIENTE)
  async function exportarExcelPorLote(loteNombre, tipo = 'LLEGÓ') {
    try {
      if (!window.XLSX) {
        SharedUI.showToast('Librería de exportación XLSX no cargada.', 'error');
        return;
      }

      SharedUI.showToast(`Generando listado de ${tipo === 'LLEGÓ' ? 'Recibidos' : 'Faltantes'}...`, 'info');

      let url = `/api/savar-scan/paquetes?estado=LLEGÓ&lote_importacion=${encodeURIComponent(loteNombre)}&limit=500`;
      if (tipo === 'PENDIENTE') {
        url = `/api/savar-scan/faltantes?lote=${encodeURIComponent(loteNombre)}`;
      }

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });

      const res = await response.json();

      if (!response.ok || !Array.isArray(res.data)) {
        throw new Error(res.message || 'No se pudieron descargar los datos para exportar.');
      }

      if (res.data.length === 0) {
        SharedUI.showToast(`No hay paquetes en estado ${tipo} para este lote.`, 'warning');
        return;
      }

      // Convertir a formato Excel legible
      let exportRows = [];

      if (tipo === 'LLEGÓ') {
        exportRows = res.data.map((item, idx) => ({
          'N°': idx + 1,
          'Código': item.codigo_paquete,
          'Consignado': item.consignado,
          'Dirección': item.direccion,
          'Teléfono': item.telefono || '',
          'Departamento': item.departamento,
          'Provincia': item.provincia,
          'Distrito': item.distrito,
          'Lote Carga': item.lote_importacion,
          'Fecha Escaneo': item.fecha_escaneo ? new Date(item.fecha_escaneo).toLocaleString('es-PE') : '',
          'Sede Escaneo': item.sede_escaneo_nombre || '',
          'Operador': item.operador_escaneo_nombre || ''
        }));
      } else {
        // Faltantes
        exportRows = res.data.map((item, idx) => ({
          'N°': idx + 1,
          'Código Faltante': item.codigo_paquete,
          'Consignado': item.consignado,
          'Dirección': item.direccion || '',
          'Teléfono': item.telefono || '',
          'Distrito': item.distrito || '',
          'Estado': 'PENDIENTE (NO LLEGÓ)'
        }));
      }

      const ws = window.XLSX.utils.json_to_sheet(exportRows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, tipo === 'LLEGÓ' ? 'Recibidos' : 'Faltantes');
      
      const cleanName = loteNombre.replace(/[\s/\\:]+/g, '_');
      const fileName = `savar_${tipo.toLowerCase()}_${cleanName}.xlsx`;
      window.XLSX.writeFile(wb, fileName);

      SharedUI.showToast(`Excel descargado con exito: ${fileName}`, 'success');

    } catch (err) {
      SharedUI.showToast(err.message || 'Error al exportar reporte Excel.', 'error');
    }
  }

  // Exportar Consolidado Mensual
  async function exportarConsolidadoMensual() {
    try {
      if (!window.XLSX) {
        SharedUI.showToast('Librería de exportación XLSX no cargada.', 'error');
        return;
      }

      // Obtener los lotes filtrados actualmente
      const query = String(Elements.filterReportesLotes.value || '').toLowerCase().trim();
      const mesFiltro = Elements.filterReportesMes.value; // e.g. "7/2026"

      const lotesReporte = State.lotes.filter(item => {
        const matchText = String(item.nombre || '').toLowerCase().includes(query);
        if (!matchText) return false;
        if (mesFiltro) {
          if (!item.fecha_creacion) return false;
          const date = new Date(item.fecha_creacion);
          const itemMes = `${date.getMonth() + 1}/${date.getFullYear()}`;
          return itemMes === mesFiltro;
        }
        return true;
      });

      if (lotesReporte.length === 0) {
        SharedUI.showToast('No hay cargas en la lista actual para exportar un consolidado.', 'warning');
        return;
      }

      SharedUI.showToast('Generando reporte consolidado...', 'info');

      // Crear filas de resumen
      let totalGeneral = 0;
      let recibidosGeneral = 0;
      let pendientesGeneral = 0;

      const rowsResumen = lotesReporte.map((item) => {
        const total = Number(item.total || 0);
        const recibidos = Number(item.recibidos || 0);
        const pendientes = Math.max(0, total - recibidos);
        const pct = total > 0 ? (recibidos / total) : 0;

        totalGeneral += total;
        recibidosGeneral += recibidos;
        pendientesGeneral += pendientes;

        return {
          'Lote / Carga': item.nombre,
          'Fecha Carga': item.fecha_creacion ? new Date(item.fecha_creacion).toLocaleDateString('es-PE') : '—',
          'Total Paquetes': total,
          'Recibidos (LLEGÓ)': recibidos,
          'Faltantes (PENDIENTE)': pendientes,
          'Efectividad (%)': `${Math.round(pct * 100)}%`
        };
      });

      // Añadir fila de totales consolidados al final
      rowsResumen.push({
        'Lote / Carga': 'TOTAL CONSOLIDADO',
        'Fecha Carga': '—',
        'Total Paquetes': totalGeneral,
        'Recibidos (LLEGÓ)': recibidosGeneral,
        'Faltantes (PENDIENTE)': pendientesGeneral,
        'Efectividad (%)': totalGeneral > 0 ? `${Math.round((recibidosGeneral / totalGeneral) * 100)}%` : '0%'
      });

      // Crear Libro de Excel
      const wb = window.XLSX.utils.book_new();
      const wsResumen = window.XLSX.utils.json_to_sheet(rowsResumen);
      
      // Autoajustar ancho de columnas
      const colWidths = [
        { wch: 30 }, // Lote
        { wch: 15 }, // Fecha
        { wch: 15 }, // Total
        { wch: 18 }, // Recibidos
        { wch: 18 }, // Faltantes
        { wch: 15 }  // Efectividad
      ];
      wsResumen['!cols'] = colWidths;

      window.XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen Mensual Cargas');

      // Nombre del archivo según el filtro
      let periodName = 'global';
      if (mesFiltro) {
        const [m, y] = mesFiltro.split('/');
        periodName = `${MESES_ES[Number(m) - 1]}_${y}`.toLowerCase();
      }
      
      const fileName = `consolidado_cargas_savar_${periodName}.xlsx`;
      window.XLSX.writeFile(wb, fileName);

      SharedUI.showToast(`Reporte consolidado mensual exportado con exito: ${fileName}`, 'success');

    } catch (err) {
      console.error('Error al exportar consolidado:', err);
      SharedUI.showToast('Ocurrió un error al generar el consolidado de facturación.', 'error');
    }
  }

  // Procesar carga de Excel masiva
  // Variable para almacenar temporalmente los paquetes analizados del Excel
  let tempParsedRows = [];

  // Procesar carga de Excel masiva y extraer combinaciones únicas
  async function importarExcel(file) {
    if (!file) return;

    const loteNombre = String(Elements.inputLoteNombre.value || '').trim();
    if (!loteNombre) {
      SharedUI.showToast('Por favor, defina un Nombre para el Lote/Carga.', 'warning');
      return;
    }

    try {
      if (typeof XLSX === 'undefined') {
        throw new Error('Librería XLSX (SheetJS) no está disponible.');
      }

      SharedUI.showToast('Leyendo archivo Excel...', 'info');

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rawRows.length === 0) {
        throw new Error('El archivo Excel está vacío.');
      }

      // Mapear filas mapeando aliases
      const mappedRows = rawRows.map(row => {
        return {
          codigo: getColumnValue(row, ['codigo', 'code', 'cod', 'codigo_paquete', 'paquete']),
          consignado: getColumnValue(row, ['consignado', 'nombre', 'cliente', 'name', 'destinatario']),
          direccion: getColumnValue(row, ['direccion', 'address', 'dir', 'domicilio']),
          telefono: getColumnValue(row, ['telefono', 'celular', 'cel', 'phone', 'numero']),
          departamento: getColumnValue(row, ['departamento', 'dpto', 'dept', 'region']),
          provincia: getColumnValue(row, ['provincia', 'prov', 'ciudad']),
          distrito: getColumnValue(row, ['distrito', 'dist', 'zona'])
        };
      }).filter(item => item.codigo && item.consignado);

      if (mappedRows.length === 0) {
        throw new Error('No se encontraron filas con campos de Código y Consignado válidos.');
      }

      // Guardar filas en variable de memoria
      tempParsedRows = mappedRows;

      // Agrupar por provincia y distrito (Estructura de árbol)
      const tree = {};
      mappedRows.forEach(item => {
        const prov = String(item.provincia || 'SIN PROVINCIA').trim().toUpperCase();
        const dist = String(item.distrito || 'SIN DISTRITO').trim().toUpperCase();
        if (!tree[prov]) {
          tree[prov] = {
            total: 0,
            districts: {}
          };
        }
        tree[prov].total++;
        tree[prov].districts[dist] = (tree[prov].districts[dist] || 0) + 1;
      });

      // Renderizar listado de provincias y distritos en el modal de filtrado
      Elements.importFiltersList.innerHTML = Object.entries(tree).map(([prov, data]) => {
        const districtsHtml = Object.entries(data.districts).map(([dist, count]) => {
          const zoneKey = `${prov} - ${dist}`;
          return `
            <label class="district-check-item">
              <div style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" checked value="${zoneKey}" class="filter-zone-checkbox" data-province="${prov}" style="width: 14px; height: 14px; accent-color: var(--ss-primary); cursor: pointer;" />
                <span class="district-name" style="font-size: 0.78rem; font-weight: 600; color: var(--ss-text);">${dist}</span>
              </div>
              <span style="font-size: 0.7rem; color: var(--ss-text-muted); font-weight: 500;">${count} pqtes</span>
            </label>
          `;
        }).join('');

        return `
          <div class="province-group-card">
            <!-- Cabecera de Provincia -->
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px dashed var(--ss-border); padding-bottom: 8px; margin-bottom: 4px;">
              <label class="province-checkbox-label" style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #0f172a; font-size: 0.85rem; cursor: pointer;">
                <input type="checkbox" class="province-checkbox" data-province="${prov}" checked style="width: 16px; height: 16px; accent-color: var(--ss-primary); cursor: pointer;" />
                ${prov}
              </label>
              <span style="font-size: 0.72rem; font-weight: 700; background: var(--ss-primary-soft); color: var(--ss-primary); padding: 2px 8px; border-radius: 4px;">
                ${data.total} pqtes
              </span>
            </div>
            <!-- Sub-grilla de Distritos -->
            <div class="province-districts-grid" style="display: flex; flex-direction: column; gap: 6px; padding-left: 2px;">
              ${districtsHtml}
            </div>
          </div>
        `;
      }).join('');

      // Cargar detalles del archivo en el nuevo modal
      Elements.filterModalFilename.textContent = file.name;
      Elements.filterModalTotalCount.textContent = `${mappedRows.length} paquetes detectados`;

      // Transición elegante de modales
      State.importModal.close();
      setTimeout(() => {
        State.filtrarZonasModal.open();
        // Resetear buscador
        if (Elements.importZoneSearch) {
          Elements.importZoneSearch.value = '';
        }
      }, 150);

      // Actualizar contador inicial del botón
      actualizarContadorImportacion();

      // Enlazar eventos bidireccionales de checkboxes
      bindCheckboxEvents();

    } catch (err) {
      console.error('Import error:', err);
      SharedUI.showToast(err.message || 'Error al procesar el archivo Excel.', 'error', { title: 'Error de Importación' });
    }
  }

  // Enlazar eventos de checkboxes de provincias y distritos
  function bindCheckboxEvents() {
    const provinceCbs = Elements.importFiltersList.querySelectorAll('.province-checkbox');
    const districtCbs = Elements.importFiltersList.querySelectorAll('.filter-zone-checkbox');

    // Sincronizar provincia -> distritos
    provinceCbs.forEach(provCb => {
      provCb.addEventListener('change', () => {
        const prov = provCb.dataset.province;
        const linkedDistricts = Elements.importFiltersList.querySelectorAll(`.filter-zone-checkbox[data-province="${prov}"]`);
        linkedDistricts.forEach(dCb => {
          dCb.checked = provCb.checked;
        });
        actualizarContadorImportacion();
      });
    });

    // Sincronizar distrito -> provincia
    districtCbs.forEach(distCb => {
      distCb.addEventListener('change', () => {
        const prov = distCb.dataset.province;
        const provCb = Elements.importFiltersList.querySelector(`.province-checkbox[data-province="${prov}"]`);
        const linkedDistricts = Array.from(Elements.importFiltersList.querySelectorAll(`.filter-zone-checkbox[data-province="${prov}"]`));
        
        if (provCb) {
          const allChecked = linkedDistricts.every(d => d.checked);
          provCb.checked = allChecked;
        }
        actualizarContadorImportacion();
      });
    });
  }

  // Recalcular contador del botón de importación
  function actualizarContadorImportacion() {
    const checkedZones = getCheckedZones();
    
    // Filtrar paquetes correspondientes
    const filteredRows = tempParsedRows.filter(item => {
      const prov = String(item.provincia || 'SIN PROVINCIA').trim().toUpperCase();
      const dist = String(item.distrito || 'SIN DISTRITO').trim().toUpperCase();
      const key = `${prov} - ${dist}`;
      return checkedZones.has(key);
    });

    Elements.btnImportSubmitFiltered.textContent = `Importar seleccionados (${filteredRows.length})`;
    Elements.btnImportSubmitFiltered.disabled = (filteredRows.length === 0);
  }

  // Obtener zonas seleccionadas (Set)
  function getCheckedZones() {
    const checked = new Set();
    const checkboxes = Elements.importFiltersList.querySelectorAll('.filter-zone-checkbox');
    checkboxes.forEach(cb => {
      if (cb.checked) checked.add(cb.value);
    });
    return checked;
  }

  // Confirmar y subir los datos filtrados
  async function subirDatosFiltrados() {
    const loteNombre = String(Elements.inputLoteNombre.value || '').trim();
    if (!loteNombre) {
      SharedUI.showToast('Por favor, defina un Nombre para el Lote/Carga.', 'warning');
      return;
    }

    const checkedZones = getCheckedZones();
    const filteredRows = tempParsedRows.filter(item => {
      const prov = String(item.provincia || 'SIN PROVINCIA').trim().toUpperCase();
      const dist = String(item.distrito || 'SIN DISTRITO').trim().toUpperCase();
      const key = `${prov} - ${dist}`;
      return checkedZones.has(key);
    });

    if (filteredRows.length === 0) {
      SharedUI.showToast('Debe seleccionar al menos una zona para importar.', 'warning');
      return;
    }

    try {
      SharedUI.showToast(`Subiendo ${filteredRows.length} paquetes al lote "${loteNombre}"...`, 'info');

      const response = await fetch('/api/savar-scan/importar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ paquetes: filteredRows, lote_importacion: loteNombre })
      });

      const res = await response.json();

      if (response.ok) {
        SharedUI.showToast(res.message || 'Importación completada correctamente.', 'success');
        resetImportModal();
        State.filtrarZonasModal.close();
        
        // Seleccionar automáticamente el lote importado
        State.loteActivo = loteNombre;
        
        await cargarLotes();
        resetDisplay();
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      console.error('Submit error:', err);
      SharedUI.showToast(err.message || 'Error al subir los datos de importación.', 'error');
    }
  }

  // Restablecer el modal de importación a su estado inicial
  function resetImportModal() {
    tempParsedRows = [];
    Elements.importFiltersList.innerHTML = '';
    if (Elements.importZoneSearch) {
      Elements.importZoneSearch.value = '';
    }
    Elements.dropzone.style.display = 'block';
    Elements.fileInput.value = '';
  }

  // Configurar listeners de Dropzone
  function setupImportDropzone() {
    const dropzone = Elements.dropzone;
    const fileInput = Elements.fileInput;

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files?.length) {
        importarExcel(e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.length) {
        importarExcel(e.dataTransfer.files[0]);
      }
    });

    // Botones de control de modales
    Elements.btnImportCancelFile.addEventListener('click', () => {
      State.filtrarZonasModal.close();
      resetImportModal();
      setTimeout(() => {
        State.importModal.open();
      }, 150);
    });

    Elements.btnImportSubmitFiltered.addEventListener('click', () => {
      subirDatosFiltrados();
    });

    // Botones de selección rápida de filtros
    Elements.btnZoneSelectAll.addEventListener('click', () => {
      const checkboxes = Elements.importFiltersList.querySelectorAll('.filter-zone-checkbox, .province-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = true;
      });
      actualizarContadorImportacion();
    });

    Elements.btnZoneSelectNone.addEventListener('click', () => {
      const checkboxes = Elements.importFiltersList.querySelectorAll('.filter-zone-checkbox, .province-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = false;
      });
      actualizarContadorImportacion();
    });

    // Buscador interactivo de zonas
    Elements.importZoneSearch.addEventListener('input', (e) => {
      const term = String(e.target.value).toLowerCase().trim();
      const groups = Elements.importFiltersList.querySelectorAll('.province-group-card');
      groups.forEach(group => {
        const provName = group.querySelector('.province-checkbox-label').textContent.toLowerCase();
        const districts = group.querySelectorAll('.district-check-item');
        let anyVisible = false;

        districts.forEach(dist => {
          const distName = dist.querySelector('.district-name').textContent.toLowerCase();
          if (provName.includes(term) || distName.includes(term)) {
            dist.style.display = 'flex';
            anyVisible = true;
          } else {
            dist.style.display = 'none';
          }
        });

        if (anyVisible) {
          group.style.display = 'flex';
        } else {
          group.style.display = 'none';
        }
      });
    });
  }

  // Atajos de teclado globales
  // Interacción de cambio de pestañas (Tabs)
  function setupTabs() {
    Elements.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        
        // Botón activo
        Elements.tabButtons.forEach(b => b.classList.toggle('active', b === btn));
        
        // Contenido activo
        Elements.tabContents.forEach(c => {
          c.classList.toggle('active', c.id === tabId);
        });

        // Enfocar input si volvimos a la pestaña de escaneo
        if (tabId === 'tab-escaneo') {
          focusInput();
        }
      });
    });
  }

  // Delegar eventos en la tabla de reportes mensuales
  function setupReportActionsDelegation() {
    Elements.reportesLotesBody.addEventListener('click', async (e) => {
      const activateBtn = e.target.closest('.action-activate');
      const exportBtn = e.target.closest('.action-export');
      const missingBtn = e.target.closest('.action-missing');
      const deleteBtn = e.target.closest('.action-delete');

      if (activateBtn) {
        const lote = activateBtn.dataset.lote;
        State.loteActivo = lote;
        State.incidenciasCount = 0;
        
        actualizarIndicadoresLote();
        resetDisplay();
        
        SharedUI.showToast(`Lote "${lote}" activado para escaneo de ingreso.`, 'success', { title: 'Lote cambiado' });
        
        // Simular clic en la pestaña de escaneo para volver al modo operativo
        const escaneoTabBtn = Elements.tabButtons.find(b => b.dataset.tab === 'tab-escaneo');
        escaneoTabBtn?.click();
      }

      if (exportBtn) {
        const lote = exportBtn.dataset.lote;
        await exportarExcelPorLote(lote, 'LLEGÓ');
      }

      if (missingBtn) {
        const lote = missingBtn.dataset.lote;
        await exportarExcelPorLote(lote, 'PENDIENTE');
      }

      if (deleteBtn) {
        const lote = deleteBtn.dataset.lote;
        const confirmDelete = await SharedUI.confirm({
          title: '¿Eliminar Lote?',
          message: `Se borrará de forma permanente el lote "${lote}" y todos sus paquetes asociados. ¿Desea continuar?`,
          confirmText: 'Sí, eliminar',
          cancelText: 'Cancelar',
          type: 'danger'
        });

        if (!confirmDelete) return;

        try {
          const response = await fetch(`/api/savar-scan/lotes/${encodeURIComponent(lote)}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });

          const res = await response.json();

          if (response.ok) {
            SharedUI.showToast(res.message || 'Lote eliminado con éxito.', 'success');
            
            // Si el lote activo actual fue el eliminado, limpiarlo
            if (State.loteActivo === lote) {
              State.loteActivo = '';
              State.incidenciasCount = 0;
              actualizarIndicadoresLote();
              resetDisplay();
            }

            // Recargar lotes
            await cargarLotes();
          } else {
            throw new Error(res.message || 'Error al eliminar el lote.');
          }
        } catch (err) {
          console.error('[savar-scan] Error al eliminar lote:', err);
          SharedUI.showToast(err.message || 'No se pudo completar la eliminación del lote.', 'error');
        }
      }
    });
  }

  // Inicialización de la pantalla
  async function init() {
    initDOMElements();

    // Cargar perfil del usuario
    State.user = API.getUser();
    
    // Validar acceso del operador
    if (!API.Auth.requirePermission('rutas.ver')) {
      return;
    }

    // Configurar Modales del SharedUI
    State.importModal = SharedUI.createModalController({
      root: Elements.modalImport,
      onClose: () => {
        focusInput();
      }
    });
    State.importModal.bindClose(Elements.modalImport.querySelector('.btn-close-modal'));
    State.importModal.bindOverlayClose();

    State.filtrarZonasModal = SharedUI.createModalController({
      root: Elements.modalFiltrarZonas,
      onClose: () => {
        focusInput();
      }
    });
    State.filtrarZonasModal.bindClose(Elements.modalFiltrarZonas.querySelector('.btn-close-modal'));
    State.filtrarZonasModal.bindOverlayClose();

    State.faltantesModal = SharedUI.createModalController({
      root: Elements.modalFaltantes,
      onClose: () => {
        focusInput();
      }
    });
    State.faltantesModal.bindClose(Elements.modalFaltantes.querySelector('.btn-close-modal'));
    State.faltantesModal.bindOverlayClose();

    // Configurar interactividades y eventos
    setupAutoFocus();
    setupImportDropzone();
    setupTabs();
    setupReportActionsDelegation();

    // Audio Init al primer clic
    document.addEventListener('click', function initAudio() {
      AudioHelper.init();
      document.removeEventListener('click', initAudio);
    }, { once: true });

    // Enlace de eventos de control lateral
    Elements.btnOpenImport.addEventListener('click', () => {
      // Prefilar fecha actual para nombre de lote con formato DD-MM-YYYY (con ceros a la izquierda)
      const hoy = new Date();
      const dd = String(hoy.getDate()).padStart(2, '0');
      const mm = String(hoy.getMonth() + 1).padStart(2, '0');
      const yyyy = hoy.getFullYear();
      const hoyStr = `${dd}-${mm}-${yyyy}`;
      Elements.inputLoteNombre.value = `SAVAR - ${hoyStr}`;
      resetImportModal();
      State.importModal.open();
    });

    Elements.btnResetScans.addEventListener('click', actionResetScans);
    Elements.btnExportScans.addEventListener('click', actionExportScans);

    // Ocultar botón de reinicio para operadores
    if (State.user?.rol !== 'SysAdmin' && State.user?.rol !== 'AdminEmpresa') {
      Elements.btnResetScans.style.display = 'none';
    }

    // El lote activo se detecta automáticamente al iniciar o al activar desde el panel de reportes.

    // Abrir modal faltantes
    Elements.btnVerFaltantes.addEventListener('click', async () => {
      Elements.filterFaltantes.value = '';
      await cargarFaltantes();
      State.faltantesModal.open();
    });

    // Filtrados en el modal de faltantes
    Elements.filterFaltantes.addEventListener('input', renderFaltantes);

    // Filtrados en la pestaña de Historial de Lotes / Reportes
    Elements.filterReportesLotes.addEventListener('input', renderReportesLotes);
    Elements.filterReportesMes.addEventListener('change', renderReportesLotes);
    
    // Exportación consolidados mensuales de facturación
    Elements.btnExportConsolidado.addEventListener('click', exportarConsolidadoMensual);

    // Entrada del lector USB / Input de escaneo
    Elements.scanInput.addEventListener('keydown', function (e) {
      // Al presionar Enter (manualmente o enviado automáticamente por la pistola lectora)
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = Elements.scanInput.value.trim();
        if (code) {
          handleScan(code);
        }
      }
    });

    // Cargar lotes del sistema
    await cargarLotes(true);

    // Cargar historial existente en BD
    await cargarHistorialInicial();

    // Enfocar
    resetDisplay();
  }

  // Esperar a que la API esté cargada
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
