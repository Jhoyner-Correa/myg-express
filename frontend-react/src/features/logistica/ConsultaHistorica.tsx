import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import '../../css/consulta-rutas.css';
import apiClient from '../../core/api/apiClient';
import * as XLSX from 'xlsx';
import { showToast, showConfirm } from '../../core/utils/toast';

const LOOKUP_STORAGE_KEY = 'myg_consulta_rutas_state';
const LOOKUP_STATE_TTL_MS = 12 * 60 * 60 * 1000;

type RouteDestination = {
  id: number;
  nombre_lote: string;
  zona?: string;
  origen?: string;
  total_registros?: number;
  total_avisos?: number;
  estado: string;
  fecha: string;
};

type UrbanoRecord = {
  routeId: string;
  guia: string;
  rastreo: string;
  cliente: string;
  telefono: string;
  contrato: string;
  localidad: string;
  peso_kg?: number;
  peso?: number;
  tipo_paquete_urbano?: string;
  tipo_paquete?: string;
  piezas?: number;
  contenido_paquete?: string;
  guia_contenido?: string;
};

type ContratoFilter = '' | 'temu' | 'no-temu';

type StoredState = {
  savedAt: number;
  queriedRouteId: string;
  selectedDestinationId: string;
  selectedLocalidad: string;
  selectedContrato: ContratoFilter;
  selectedSort: string;
};

export const ConsultaHistorica: React.FC = () => {
  const [urbanoConnected, setUrbanoConnected] = useState(false);
  const [isConsulting, setIsConsulting] = useState(false);
  const [routeIdInput, setRouteIdInput] = useState('');
  const [records, setRecords] = useState<UrbanoRecord[]>([]);
  const [routeResult, setRouteResult] = useState<{ routeId?: string } | null>(null);
  const [destinations, setDestinations] = useState<RouteDestination[]>([]);
  const [selectedDestRouteId, setSelectedDestRouteId] = useState('');
  const [filterLocalidad, setFilterLocalidad] = useState('');
  const [filterContrato, setFilterContrato] = useState<ContratoFilter>('');
  const [filterSort, setFilterSort] = useState('default');
  const [showContratoDropdown, setShowContratoDropdown] = useState(false);
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const [destSearchQuery, setDestSearchQuery] = useState('');

  const contratoRef = useRef<HTMLTableCellElement>(null);
  const destDropdownRef = useRef<HTMLDivElement>(null);
  const destSearchInputRef = useRef<HTMLInputElement>(null);

  const [currentDate] = useState(() =>
    new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  );

  const uniqueLocalidades = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.localidad && r.localidad !== '-') set.add(r.localidad);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [records]);

  const filteredRecords = useMemo(() => {
    let result = [...records];
    if (filterLocalidad) result = result.filter(r => r.localidad === filterLocalidad);
    if (filterContrato === 'temu') result = result.filter(r => (r.contrato || '').toLowerCase().includes('temu'));
    else if (filterContrato === 'no-temu') result = result.filter(r => !(r.contrato || '').toLowerCase().includes('temu'));
    result.sort((a, b) => {
      if (filterSort === 'default') return 0;
      const [, direction] = filterSort.split('-');
      const field = filterSort.split('-')[0] as keyof UrbanoRecord;
      const va = String(a[field] || '').toLowerCase();
      const vb = String(b[field] || '').toLowerCase();
      if (va === vb) return 0;
      const cmp = va > vb ? 1 : -1;
      return direction === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [records, filterLocalidad, filterContrato, filterSort]);

  const localityCount = useMemo(() => uniqueLocalidades.length, [uniqueLocalidades]);
  const totalGuias = records.length;

  const filteredDestinations = useMemo(() => {
    const q = normalizeText(destSearchQuery);
    if (!q) return destinations;
    return destinations.filter(r => normalizeText(buildDestinationSearchText(r)).includes(q));
  }, [destinations, destSearchQuery]);

  const groupedDestinations = useMemo(() => {
    const groups: Record<string, RouteDestination[]> = {};
    filteredDestinations.forEach(r => {
      const key = sanitize(r.origen || 'Otro');
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    const orderMap: Record<string, number> = { 'Temu': 0, 'Urbano': 1 };
    return Object.entries(groups).sort(([a], [b]) => (orderMap[a] ?? 99) - (orderMap[b] ?? 99));
  }, [filteredDestinations]);

  const loadInitialData = useCallback(async () => {
    try {
      const [statusRes, destinationsRes] = await Promise.all([
        apiClient.get('/produccion/status'),
        apiClient.get('/lotes')
      ]);
      if (statusRes.data?.ok) {
        const conn = !!statusRes.data.data?.connected;
        setUrbanoConnected(conn);
      }
      if (destinationsRes.data?.ok) {
        const d = new Date();
        const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const todayActive = (destinationsRes.data.data || []).filter((route: RouteDestination) => {
          const isToday = String(route.fecha || '').startsWith(todayStr);
          const isFinalized = route.estado === 'completado' || route.estado === 'cancelado';
          return isToday && !isFinalized;
        });
        setDestinations(todayActive);
      }
    } catch {
      console.error('Error al cargar datos iniciales');
    }
  }, []);

  const handleConsult = async () => {
    const routeId = routeIdInput.trim();
    if (!routeId || !/^\d{1,20}$/.test(routeId)) {
      showToast('Ingresa un número de ruta válido.', 'error', { title: 'Ruta inválida' });
      return;
    }
    setIsConsulting(true);
    setRecords([]);
    setRouteResult(null);
    setFilterLocalidad('');
    setFilterContrato('');
    setFilterSort('default');

    try {
      const response = await apiClient.get(`/produccion/rutas/${routeId}`);
      const result = response.data?.data || {};
      const list = Array.isArray(result.records) ? result.records : [];
      setRecords(list);
      setRouteResult(result);
      setUrbanoConnected(true);
      showToast(`${list.length} registros encontrados.`, 'success', { title: 'Consulta completada' });
      saveLookupState(routeId);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'No se pudo consultar la ruta.';
      if (normalizeText(msg).includes('sesion de urbano')) setUrbanoConnected(false);
      showToast(msg, 'error', { title: 'Error de consulta' });
    } finally {
      setIsConsulting(false);
    }
  };

  const handleSendToRoute = async () => {
    if (!selectedDestRouteId) {
      showToast('Selecciona una ruta destino.', 'error', { title: 'Ruta requerida' });
      return;
    }
    if (!filteredRecords.length) {
      showToast('No hay registros disponibles para enviar.', 'error', { title: 'Sin registros' });
      return;
    }
    const dest = destinations.find(d => String(d.id) === selectedDestRouteId);
    const destName = dest ? sanitize(dest.nombre_lote || `Ruta ${dest.id}`) : '-';
    const confirmed = await showConfirm({
      title: 'Confirmar envío a la ruta',
      message: `Se importarán ${filteredRecords.length} registros a la ruta "${destName}".`,
      confirmText: 'Importar registros',
      type: 'success'
    });
    if (!confirmed) return;

    const avisos = filteredRecords
      .map(item => ({
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
      .filter(a => a.telefono.length >= 8);

    if (!avisos.length) {
      showToast('Los registros no contienen teléfonos válidos.', 'error', { title: 'Validación de datos' });
      return;
    }

    try {
      await apiClient.post('/avisos/importar', {
        lote_id: Number(selectedDestRouteId),
        avisos
      });
      showToast('Registros importados a la ruta correctamente.', 'success', { title: 'Importación completada' });
    } catch (err: any) {
      showToast(err.response?.data?.message || 'No se pudo importar a la ruta.', 'error', { title: 'Error de importación' });
    }
  };

  const handleExportExcel = () => {
    if (filteredRecords.length === 0) return;
    const routeId = sanitize(routeResult?.routeId || routeIdInput || 'ruta');
    const data = filteredRecords.map(item => ({
      'Ruta ID': sanitize(item.routeId),
      Guia: formatGuide(item.guia),
      Rastreo: sanitize(item.rastreo),
      Cliente: sanitize(item.cliente),
      Telefono: formatPhone(item.telefono),
      Contrato: sanitize(item.contrato),
      Localidad: sanitize(item.localidad)
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ruta');
    XLSX.writeFile(workbook, `ruta_${routeId}.xlsx`);
    showToast('Archivo Excel descargado correctamente.', 'success', { title: 'Exportación completada' });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isConsulting && routeIdInput.trim()) {
      handleConsult();
    }
  };

  const handleSelectDestination = (value: string) => {
    setSelectedDestRouteId(value);
    setShowDestDropdown(false);
    saveLookupState(routeIdInput);
  };

  const handleOpenDestDropdown = () => {
    if (destinations.length === 0) return;
    setShowDestDropdown(true);
    setDestSearchQuery('');
    setTimeout(() => destSearchInputRef.current?.focus(), 60);
  };

  const selectedDest = useMemo(() => {
    if (!selectedDestRouteId) return null;
    return destinations.find(r => String(r.id) === selectedDestRouteId) || null;
  }, [destinations, selectedDestRouteId]);

  const getChipClass = (origin = '') => {
    const v = normalizeText(origin);
    if (v.includes('temu')) return 'temu';
    if (v.includes('urbano')) return 'urbano';
    if (v.includes('mgg') || v.includes('myg') || v.includes('my g')) return 'mgg';
    return '';
  };

  const saveLookupState = (currentRouteId?: string) => {
    try {
      const state: StoredState = {
        savedAt: Date.now(),
        queriedRouteId: currentRouteId ?? routeIdInput,
        selectedDestinationId: selectedDestRouteId,
        selectedLocalidad: filterLocalidad,
        selectedContrato: filterContrato,
        selectedSort: filterSort
      };
      localStorage.setItem(LOOKUP_STORAGE_KEY, JSON.stringify(state));
    } catch { /* localStorage no disponible */ }
  };

  const getStoredLookupState = (): StoredState | null => {
    try {
      const raw = localStorage.getItem(LOOKUP_STORAGE_KEY);
      if (!raw) return null;
      const state = JSON.parse(raw) as StoredState;
      if (!state?.savedAt || Date.now() - state.savedAt > LOOKUP_STATE_TTL_MS) {
        localStorage.removeItem(LOOKUP_STORAGE_KEY);
        return null;
      }
      return state;
    } catch {
      localStorage.removeItem(LOOKUP_STORAGE_KEY);
      return null;
    }
  };

  const restoreLatestCachedRoute = useCallback(async () => {
    try {
      const response = await apiClient.get('/produccion/cache/ultima');
      const data = response.data?.data;
      if (!data?.routeId || !data?.result) return;
      const routeId = data.routeId;
      const list = Array.isArray(data.result.records) ? data.result.records : [];
      setRouteIdInput(normalizeRouteId(routeId));
      setRouteResult(data.result);
      setRecords(list);
      const stored = getStoredLookupState();
      if (stored && stored.queriedRouteId === routeId) {
        if (stored.selectedLocalidad) setFilterLocalidad(stored.selectedLocalidad);
        if (stored.selectedContrato) setFilterContrato(stored.selectedContrato);
        if (stored.selectedSort) setFilterSort(stored.selectedSort);
        if (stored.selectedDestinationId) setSelectedDestRouteId(stored.selectedDestinationId);
      }
    } catch { /* no hay caché disponible */ }
  }, []);

  useEffect(() => {
    loadInitialData();
    restoreLatestCachedRoute();
  }, [loadInitialData, restoreLatestCachedRoute]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contratoRef.current && !contratoRef.current.contains(e.target as Node)) {
        setShowContratoDropdown(false);
      }
      if (destDropdownRef.current && !destDropdownRef.current.contains(e.target as Node)) {
        setShowDestDropdown(false);
        setDestSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowContratoDropdown(false);
        setShowDestDropdown(false);
        setDestSearchQuery('');
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <main className="main consulta-rutas-page" id="main-content">
      <header className="topbar">
        <div className="header-title-container">
          <div className="header-icon-box">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </div>
          <div>
            <div className="topbar-title">Consulta de rutas</div>
            <div className="topbar-sub">Busca y consulta guías de Urbano en tiempo real</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="topbar-date" id="current-date">{currentDate}</span>
          <div className="user-role-badge">
            <span className="status-dot"></span>
            <span id="user-rol-topbar">Encargado de Oficina</span>
          </div>
        </div>
      </header>

      <main className="cr-content">
        <section className="cr-panel">
          <div className="cr-connect-banner" id="urbano-connect-card">
            <div className="cr-connect-left">
              <div className={`cr-connect-dot${urbanoConnected ? ' active' : ''}`} id="cr-session-dot"></div>
              <img src="/img/urbano_sin_fondo.png" alt="Urbano" className="cr-connect-logo" />
              <div className="cr-connect-info">
                <strong id="urbano-card-title">
                  {urbanoConnected ? 'Urbano listo para consultar' : 'Urbano por sede configurado'}
                </strong>
                <span id="urbano-card-desc">
                  {urbanoConnected
                    ? 'Sesión activa para esta sede.'
                    : 'La conexión se iniciará automáticamente al consultar una ruta.'}
                </span>
              </div>
            </div>
          </div>

          <div className="cr-panel-divider"></div>

          <div className="cr-search-zone">
            <div className="cr-search-primary">
              <div className="cr-field-group">
                <label className="cr-label" htmlFor="input-route-id">
                  <svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" rx="2" /><path d="M16 8h4l3 3v5h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                  Número de ruta
                </label>
                <div className="cr-input-main-wrap">
                  <input
                    id="input-route-id"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Ej. 1044897"
                    className="cr-input-main"
                    value={routeIdInput}
                    onChange={(e) => setRouteIdInput(normalizeRouteId(e.target.value))}
                    onKeyDown={handleKeyDown}
                    disabled={isConsulting}
                  />
                </div>
              </div>
              <button
                className="cr-btn cr-btn-primary cr-btn-consult"
                id="btn-consultar-ruta"
                type="button"
                disabled={isConsulting || !routeIdInput.trim()}
                onClick={handleConsult}
              >
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                {isConsulting ? 'Consultando...' : 'Consultar ruta'}
              </button>
            </div>

            <div className="cr-search-filters">
              <div className="cr-field-group">
                <label className="cr-label">
                  <svg viewBox="0 0 24 24"><path d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z" /><circle cx="12" cy="10" r="3" /></svg>
                  Localidad
                </label>
                <div className="cr-select-wrap">
                  <select
                    id="select-localidad-filter"
                    value={filterLocalidad}
                    onChange={(e) => setFilterLocalidad(e.target.value)}
                    disabled={uniqueLocalidades.length <= 1}
                  >
                    <option value="">Todas las localidades</option>
                    {uniqueLocalidades.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <svg className="cr-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              </div>

              <div className="cr-field-group">
                <label className="cr-label">
                  <svg viewBox="0 0 24 24"><path d="M8 6v12" /><path d="m5 9 3-3 3 3" /><path d="M16 18V6" /><path d="m13 15 3 3 3-3" /></svg>
                  Ordenar por
                </label>
                <div className="cr-select-wrap">
                  <select
                    id="select-result-sort"
                    value={filterSort}
                    onChange={(e) => setFilterSort(e.target.value)}
                    disabled={records.length === 0}
                  >
                    <option value="default">Más reciente</option>
                    <option value="guia-asc">Guía A-Z</option>
                    <option value="cliente-asc">Cliente A-Z</option>
                    <option value="localidad-asc">Localidad A-Z</option>
                  </select>
                  <svg className="cr-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                </div>
              </div>

              <div className="cr-field-group cr-field-group--wide">
                <label className="cr-label" id="label-destino-ruta">
                  <svg viewBox="0 0 24 24"><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /></svg>
                  Ruta destino
                </label>
                <div className="cr-dropdown" id="cr-dropdown-destino" ref={destDropdownRef}>
                  <button
                    type="button"
                    className={`cr-dropdown-trigger${showDestDropdown ? ' open' : ''}`}
                    id="cr-dropdown-trigger"
                    disabled={destinations.length === 0}
                    onClick={handleOpenDestDropdown}
                    aria-haspopup="listbox"
                    aria-expanded={showDestDropdown}
                    aria-labelledby="label-destino-ruta cr-dd-label-text"
                  >
                    <svg className="cr-dd-icon-left" viewBox="0 0 24 24"><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /></svg>
                    <span className={`cr-dd-label${!selectedDestRouteId ? ' placeholder' : ''}`} id="cr-dd-label-text">
                      {selectedDest && selectedDestRouteId ? (
                        <span className="cr-selected-wrapper">
                          <span className="cr-selected-code">MYG-{selectedDest.id}</span>
                          <span className="cr-selected-name">
                            Ruta {sanitize(selectedDest.zona || cleanRouteName(selectedDest.nombre_lote))}
                          </span>
                          {selectedDest.origen && selectedDest.origen !== '-' && selectedDest.origen.toLowerCase() !== 'otro' && (
                            <span className={`cr-dd-chip ${getChipClass(selectedDest.origen)}`}>{selectedDest.origen}</span>
                          )}
                        </span>
                      ) : (
                        destinations.length === 0 ? 'Sin lotes activos hoy' : 'Seleccionar ruta destino'
                      )}
                    </span>
                    <svg className="cr-dd-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>

                  <div className={`cr-dropdown-panel${showDestDropdown ? ' open' : ''}`} id="cr-dropdown-panel" role="listbox">
                    <div className="cr-dd-search">
                      <div className="cr-dd-search-wrap">
                        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                        <input
                          type="text"
                          className="cr-dd-search-input"
                          id="cr-dd-search-input"
                          ref={destSearchInputRef}
                          placeholder="Buscar lote"
                          value={destSearchQuery}
                          onChange={(e) => setDestSearchQuery(e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div className="cr-dd-list" id="cr-dd-list">
                      {!destSearchQuery && (
                        <div
                          className={`cr-dd-option placeholder-opt${!selectedDestRouteId ? ' selected' : ''}`}
                          data-value=""
                          role="option"
                          onClick={() => handleSelectDestination('')}
                        >
                          <svg style={{ width: '12px', height: '12px', stroke: '#9aada3', fill: 'none', strokeWidth: 2, flexShrink: 0 }} viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          <span className="cr-dd-name">Sin selección</span>
                        </div>
                      )}
                      {groupedDestinations.length === 0 ? (
                        <div className="cr-dd-empty">
                          <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', stroke: '#9aada3', fill: 'none', strokeWidth: 1.5, marginBottom: '6px', display: 'block', marginLeft: 'auto', marginRight: 'auto' }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                          Sin resultados para <strong>{destSearchQuery}</strong>
                        </div>
                      ) : groupedDestinations.map(([origen, rutas]) => (
                        <React.Fragment key={origen}>
                          <div className="cr-dd-group-header">
                            <span className={`cr-dd-chip ${getChipClass(origen)}`}>{origen}</span>
                            <span className="cr-dd-group-count">{rutas.length} lote{rutas.length !== 1 ? 's' : ''}</span>
                          </div>
                          {rutas.map(r => {
                            const isSelected = String(r.id) === selectedDestRouteId;
                            const rawNombre = r.nombre_lote || `Ruta ${r.id}`;
                            const nombreParsed = cleanRouteName(rawNombre);
                            const cleanOrigen = r.origen && r.origen !== '-' && r.origen.toLowerCase() !== 'otro' ? r.origen : '';
                            const zonaClean = r.zona || nombreParsed;
                            const paquetes = r.total_avisos != null ? Number(r.total_avisos) : (r.total_registros != null ? Number(r.total_registros) : 0);
                            const estadoClean = String(r.estado || 'pendiente').toLowerCase();
                            let estadoLabel = 'Pendiente';
                            let statusDotColor = '#94a3b8';
                            if (estadoClean === 'pendiente' || estadoClean === 'borrador') {
                              estadoLabel = 'Pendiente';
                              statusDotColor = '#f59e0b';
                            } else if (estadoClean === 'procesando') {
                              estadoLabel = 'Procesando';
                              statusDotColor = '#3b82f6';
                            }
                            const metaParts = [`MYG-${r.id}`];
                            if (cleanOrigen) metaParts.push(`Origen: ${cleanOrigen}`);
                            metaParts.push(`${paquetes} paq.`);
                            return (
                              <div
                                key={r.id}
                                className={`cr-dd-option${isSelected ? ' selected' : ''}`}
                                data-value={r.id}
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => handleSelectDestination(String(r.id))}
                              >
                                <div className="cr-dd-icon-box">
                                  <svg viewBox="0 0 24 24" className="cr-dd-map-icon"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                                </div>
                                <span className="cr-dd-text">
                                  <span className="cr-dd-name">{zonaClean}</span>
                                  <span className="cr-dd-meta">{metaParts.join(' · ')}</span>
                                </span>
                                <div className="cr-dd-right-wrap">
                                  <span className="cr-dd-status-badge">
                                    <span className="status-dot" style={{ backgroundColor: statusDotColor }}></span>
                                    {estadoLabel}
                                  </span>
                                  <svg className="cr-dd-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>
                                </div>
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>
                <select id="select-destino-ruta" hidden aria-hidden="true" tabIndex={-1} value={selectedDestRouteId} onChange={() => {}}>
                  <option value="">-</option>
                  {destinations.map(d => <option key={d.id} value={d.id}>{d.nombre_lote}</option>)}
                </select>
              </div>

              <div className="cr-field-group cr-actions-group">
                <label className="cr-label cr-label--invisible">Acciones</label>
                <div className="cr-actions">
                  <button
                    className="cr-btn cr-btn-ghost cr-btn-icon"
                    id="btn-exportar-ruta"
                    type="button"
                    disabled={filteredRecords.length === 0}
                    onClick={handleExportExcel}
                  >
                    <svg viewBox="0 0 24 24"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
                    <span>Excel</span>
                  </button>
                  <button
                    className="cr-btn cr-btn-success"
                    id="btn-enviar-a-ruta"
                    type="button"
                    disabled={filteredRecords.length === 0 || !selectedDestRouteId}
                    onClick={handleSendToRoute}
                  >
                    <svg viewBox="0 0 24 24"><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4 20-7Z" /></svg>
                    Enviar al lote
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="cr-results-section">
          <div className="cr-results-header">
            <div className="cr-results-title-wrap">
              <div className="cr-results-icon">
                <svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>
              </div>
              <div>
                <h2>Resultados</h2>
                <p id="result-status-sub">
                  {totalGuias > 0
                    ? `${filteredRecords.length} registro${filteredRecords.length !== 1 ? 's' : ''}`
                    : 'Consulta una ruta para visualizar los registros.'}
                </p>
              </div>
            </div>

            <div className="cr-results-header-right">
              <div className="cr-metrics" id="cr-metrics-bar">
                <div className="cr-metric">
                  <span>Ruta</span>
                  <strong id="stat-route-id">{sanitize(routeResult?.routeId || routeIdInput || '-')}</strong>
                </div>
                <div className="cr-metric-divider"></div>
                <div className="cr-metric">
                  <span>Guías</span>
                  <strong id="stat-total-guias">{totalGuias}</strong>
                </div>
                <div className="cr-metric-divider"></div>
                <div className="cr-metric">
                  <span>Registros</span>
                  <strong id="stat-total-registros">{totalGuias}</strong>
                </div>
                <div className="cr-metric-divider"></div>
                <div className="cr-metric">
                  <span>Localidades</span>
                  <strong id="stat-total-localidades">{localityCount}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="cr-table-wrap">
            {isConsulting ? (
              <div className="cr-skeleton" id="cr-skeleton">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="cr-skeleton-row">
                    <div className="cr-skel cr-skel-sm"></div>
                    <div className="cr-skel cr-skel-md"></div>
                    <div className="cr-skel cr-skel-lg"></div>
                    <div className="cr-skel cr-skel-md"></div>
                    <div className="cr-skel cr-skel-sm"></div>
                    <div className="cr-skel cr-skel-sm"></div>
                    <div className="cr-skel cr-skel-md"></div>
                  </div>
                ))}
              </div>
            ) : filteredRecords.length > 0 ? (
              <>
                <table id="cr-preview-table">
                  <thead>
                    <tr>
                      <th>Ruta</th>
                      <th>Guía</th>
                      <th>Rastreo</th>
                      <th>Cliente</th>
                      <th>Teléfono</th>
                      <th className="cr-th-contrato" id="cr-th-contrato" ref={contratoRef}>
                        <button
                          type="button"
                          className={`cr-th-contrato-btn${filterContrato ? ' active' : ''}`}
                          id="cr-contrato-filter-trigger"
                          onClick={() => setShowContratoDropdown(!showContratoDropdown)}
                        >
                          Contrato
                          <svg className="cr-th-filter-icon" viewBox="0 0 24 24"><path d="M4 7h16" /><path d="M7 12h10" /><path d="M10 17h4" /></svg>
                        </button>
                        <div className={`cr-contrato-dropdown${showContratoDropdown ? ' open' : ''}`} id="cr-contrato-dropdown">
                          {(['', 'temu', 'no-temu'] as ContratoFilter[]).map(val => (
                            <button
                              key={val}
                              type="button"
                              className={`cr-contrato-option${filterContrato === val ? ' active' : ''}`}
                              data-value={val}
                              onClick={() => { setFilterContrato(val); setShowContratoDropdown(false); }}
                            >
                              {val === '' ? 'Todos' : val === 'temu' ? 'Solo Temu' : 'Sin Temu'}
                            </button>
                          ))}
                        </div>
                      </th>
                      <th>Localidad</th>
                    </tr>
                  </thead>
                  <tbody id="preview-rutas-body">
                    {filteredRecords.map((item, idx) => (
                      <tr key={idx}>
                        <td className="mono-cell">{sanitize(item.routeId)}</td>
                        <td className="mono-cell">{formatGuide(item.guia)}</td>
                        <td className="mono-cell">{sanitize(item.rastreo)}</td>
                        <td>
                          <div className="client-cell">
                            <span className="client-name">{sanitize(item.cliente)}</span>
                          </div>
                        </td>
                        <td>{formatPhone(item.telefono)}</td>
                        <td>{sanitize(item.contrato)}</td>
                        <td>
                          <span className="location-badge">{formatLocalidad(item.localidad)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="cr-table-footer" id="cr-table-footer">
                  <span id="results-range">
                    {filteredRecords.length} registro{filteredRecords.length !== 1 ? 's' : ''}.
                  </span>
                </div>
              </>
            ) : (
              <div id="results-empty-state" className="cr-empty">
                <div className="cr-empty-icon">
                  <svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>
                </div>
                <strong>Sin resultados aún</strong>
                <span>Ingresa un número de ruta y haz clic en <em>Consultar ruta</em>.</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </main>
  );
};

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function sanitize(value: string | number | null | undefined): string {
  return String(value ?? '').trim() || '-';
}

function sanitizeOptional(value: string | null | undefined): string | null {
  const clean = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean || null;
}

function normalizeRouteId(value: string): string {
  return String(value || '').replace(/\D+/g, '').slice(0, 20);
}

function normalizePhone(value: string): string {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeWeight(value: string | number | null | undefined): number | null {
  const raw = String(value ?? '').replace(',', '.').replace(/[^\d.]/g, '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(3)) : null;
}

function normalizeInteger(value: string | number | null | undefined): number | null {
  const parsed = Number(String(value ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function formatGuide(value: string): string {
  const text = sanitize(value);
  return text === '-' ? text : text.toUpperCase();
}

function formatLocalidad(value: string): string {
  const text = sanitize(value);
  if (text === '-') return text;
  return text.replace(/\s*\([^)]*\)\s*/g, '').trim() || '-';
}

function formatPhone(value: string): string {
  const raw = normalizePhone(value);
  if (!raw) return '-';
  return raw.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

function cleanRouteName(name: string): string {
  const value = sanitize(name);
  return value.replace(/^Ruta\s*\d+\s*[-.]\s*/i, '').trim() || value;
}

function buildDestinationSearchText(route: RouteDestination): string {
  return `${route.id} MYG-${route.id} ${route.nombre_lote || ''} ${route.origen || ''} ${route.zona || ''}`;
}
