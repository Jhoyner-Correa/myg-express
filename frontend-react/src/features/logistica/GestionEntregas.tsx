import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../../css/gestion-entregas.css';
import { useAuth } from '../../core/auth/authState';
import apiClient from '../../core/api/apiClient';
import { showToast, showConfirm } from '../../core/utils/toast';

type RouteOption = {
  id: number;
  nombre_lote: string;
};

type ClientItem = {
  cliente_key: string;
  nombre: string;
  telefono: string;
  sede_nombre: string;
  pendientes: number;
  recogidos: number;
  ultimo_ingreso: string;
};

type PackageItem = {
  id: number;
  codigo_paquete: string;
  nombre_lote: string;
  fecha_ingreso: string;
  peso_kg: number | string | null;
  tipo_paquete_urbano?: string;
  tamano_paquete?: {
    label: string;
    codigo: string;
    rango: string;
  };
  piezas?: number;
  contenido_paquete?: string;
  estado_entrega: string;
  fecha_entrega?: string;
  observacion_entrega?: string;
  ruta?: { nombre?: string; zona?: string; id?: number };
  lote_id?: number;
  cliente?: string;
  telefono?: string;
};

type GlobalStats = {
  pendientes: number;
  recogidos: number;
};

const maskPhone = (phone: string | null | undefined): string => {
  const clean = String(phone || '').replace(/\D/g, '');
  if (clean.length < 6) return phone || 'Sin teléfono';
  return `${clean.slice(0, 3)} *** ${clean.slice(-3)}`;
};

const formatDate = (value: string | null | undefined, withTime = false): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
};

const formatRelativeDate = (value: string | null | undefined): string => {
  if (!value) return '-';
  const date = new Date(value);
  if (isNaN(date.getTime())) return '-';
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const valueStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((dayStart - valueStart) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  return formatDate(value);
};

const formatWeight = (value: number | string | null | undefined): string => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 'Sin peso';
  return `${parsed.toFixed(parsed >= 10 ? 1 : 3).replace(/\.?0+$/, '')} kg`;
};

const packageTypeLabel = (item: PackageItem): string => {
  return item.tamano_paquete?.label || item.tipo_paquete_urbano || 'Sin tipo';
};

const packageTypeCode = (item: PackageItem): string => {
  return item.tamano_paquete?.codigo || 'sin_tipo';
};

const packageDetail = (item: PackageItem): string => {
  const pieces = Number(item.piezas || 0);
  const content = item.contenido_paquete ? String(item.contenido_paquete) : '';
  const parts: string[] = [];
  if (item.tamano_paquete?.rango) parts.push(item.tamano_paquete.rango);
  if (item.tipo_paquete_urbano) parts.push(`Urbano: ${item.tipo_paquete_urbano}`);
  if (pieces > 0) parts.push(`${pieces} ${pieces === 1 ? 'pieza' : 'piezas'}`);
  if (content) parts.push(content);
  return parts.join(' - ');
};

const routeLabel = (item: PackageItem): string => {
  const route = item.ruta || {};
  return route.nombre || `Ruta ${route.id || item.lote_id || '-'}`;
};

const csvEscape = (value: unknown): string => {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
};

export const GestionEntregas: React.FC = () => {
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterFecha, setFilterFecha] = useState('');
  const [filterLote, setFilterLote] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [stats, setStats] = useState<GlobalStats>({ pendientes: 0, recogidos: 0 });

  const [showModal, setShowModal] = useState(false);
  const [pendingDeliveryId, setPendingDeliveryId] = useState<number | null>(null);
  const [observation, setObservation] = useState('Entregado con DNI fisico');
  const [confirming, setConfirming] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const observationRef = useRef<HTMLTextAreaElement>(null);

  const currentDate = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const loadStats = useCallback(async () => {
    try {
      const res = await apiClient.get('/entregas/resumen');
      if (res.data?.ok) setStats(res.data.data || { pendientes: 0, recogidos: 0 });
    } catch {
      setStats({ pendientes: 0, recogidos: 0 });
    }
  }, []);

  const loadRoutes = useCallback(async () => {
    try {
      const res = await apiClient.get('/lotes');
      if (res.data?.ok) setRoutes(Array.isArray(res.data.data) ? res.data.data : []);
    } catch {
      setRoutes([]);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadRoutes();
  }, [loadStats, loadRoutes]);

  const searchClients = useCallback(async () => {
    const q = searchQuery.trim();
    const hasFilter = Boolean(filterEstado || filterFecha || filterLote);
    if (!q && !hasFilter) {
      showToast('Ingresa un apellido, nombre, teléfono o código de paquete.', 'warning');
      searchInputRef.current?.focus();
      return;
    }
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const res = await apiClient.get('/entregas/clientes', {
        params: { q, estado: filterEstado, fecha: filterFecha, lote_id: filterLote, limit: 40 },
      });
      setClients(Array.isArray(res.data?.data) ? res.data.data : []);
      setSelectedClient(null);
      setPackages([]);
    } catch (err: any) {
      setClients([]);
      setSelectedClient(null);
      setPackages([]);
      showToast(err?.message || 'No se pudo buscar clientes.', 'error');
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, filterEstado, filterFecha, filterLote]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchClients();
  };

  const selectClient = useCallback(async (client: ClientItem) => {
    setSelectedClient(client);
    setProfileLoading(true);
    try {
      const res = await apiClient.get(`/entregas/clientes/${client.cliente_key}/paquetes`);
      setPackages(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err: any) {
      setPackages([]);
      showToast(err?.message || 'No se pudo cargar la ficha del cliente.', 'error');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const openDeliveryModal = (item: PackageItem) => {
    setPendingDeliveryId(item.id);
    setObservation('Entregado con DNI fisico');
    setShowModal(true);
    setTimeout(() => observationRef.current?.focus(), 80);
  };

  const closeModal = () => {
    setShowModal(false);
    setPendingDeliveryId(null);
    setObservation('Entregado con DNI fisico');
  };

  const confirmDelivery = async () => {
    const id = pendingDeliveryId;
    if (!id) return;
    setConfirming(true);
    try {
      const clientKey = selectedClient?.cliente_key;
      const obs = observation.trim() || 'Recogido en oficina';
      const res = await apiClient.patch(`/entregas/${id}/recoger`, { observacion: obs });
      if (res.data?.ok) {
        closeModal();
        showToast('Entrega confirmada correctamente.', 'success');
        await loadStats();
        await searchClients();
        if (clientKey) {
          const stillExists = clients.some((c) => c.cliente_key === clientKey);
          if (stillExists) {
            const client = clients.find((c) => c.cliente_key === clientKey)!;
            await selectClient(client);
          }
        }
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo confirmar la entrega.', 'error');
    } finally {
      setConfirming(false);
    }
  };

  const markPending = useCallback(async (id: number) => {
    const confirmed = await showConfirm({
      title: 'Revertir entrega',
      message: 'El paquete volverá a la lista de pendientes.',
      confirmText: 'Revertir',
      cancelText: 'Cancelar',
      type: 'warning',
    });
    if (!confirmed) return;
    try {
      const clientKey = selectedClient?.cliente_key;
      const res = await apiClient.patch(`/entregas/${id}/pendiente`);
      if (res.data?.ok) {
        showToast('Paquete devuelto a pendiente.', 'success');
        await loadStats();
        await searchClients();
        if (clientKey) {
          const client = clients.find((c) => c.cliente_key === clientKey);
          if (client) await selectClient(client);
        }
      }
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'No se pudo revertir la entrega.', 'error');
    }
  }, [selectedClient, clients, loadStats, searchClients, selectClient]);

  const resetFilters = () => {
    setSearchQuery('');
    setFilterEstado('');
    setFilterFecha('');
    setFilterLote('');
    setClients([]);
    setSelectedClient(null);
    setPackages([]);
    setHasSearched(false);
    searchInputRef.current?.focus();
  };

  const exportCsv = () => {
    if (!packages.length || !selectedClient) return;
    const headers = [
      'Cliente', 'Teléfono', 'Código', 'Fecha ingreso', 'Ruta', 'Zona',
      'Peso kg', 'Tamaño calculado', 'Rango tamaño', 'Tipo paquete Urbano',
      'Piezas', 'Contenido', 'Estado entrega', 'Fecha entrega', 'Observación',
    ];
    const lines = packages.map((item) =>
      [
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
        formatDate(item.fecha_entrega ?? null, true),
        item.observacion_entrega || '',
      ].map(csvEscape).join(','),
    );
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `entregas_${selectedClient.nombre.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const pendingPkgs = packages.filter((p) => p.estado_entrega === 'pendiente');
  const donePkgs = packages.filter((p) => p.estado_entrega === 'recogido');
  const lastIngreso = packages
    .map((p) => p.fecha_ingreso)
    .filter(Boolean)
    .sort()
    .pop();

  const renderClientList = () => {
    if (!hasSearched) {
      return (
        <div className="ge-empty ge-empty-left">
          <div className="ge-empty-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <strong>Busca un cliente</strong>
        </div>
      );
    }
    if (!clients.length) {
      return (
        <div className="ge-empty ge-empty-compact">
          <div className="ge-empty-icon">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <strong>Sin coincidencias</strong>
          <span>Prueba con otro apellido, teléfono o código.</span>
        </div>
      );
    }
    return clients.map((client) => {
      const active = selectedClient?.cliente_key === client.cliente_key;
      const pending = Number(client.pendientes || 0);
      const done = Number(client.recogidos || 0);
      const last = client.ultimo_ingreso ? formatRelativeDate(client.ultimo_ingreso).toLowerCase() : '-';
      return (
        <button
          key={client.cliente_key}
          className={`ge-client-card${active ? ' active' : ''}`}
          type="button"
          data-client-key={client.cliente_key}
          onClick={() => selectClient(client)}
        >
          <span className="ge-client-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </span>
          <span className="ge-client-main">
            <span className="ge-client-name">{client.nombre || 'Sin nombre'}</span>
            <span className="ge-client-phone">Tel: {maskPhone(client.telefono)}</span>
            <span className="ge-client-stats">
              {pending === 0 ? (
                <span className="status-pending zero">0 pendientes</span>
              ) : pending === 1 ? (
                <span className="status-pending one">1 paquete pendiente</span>
              ) : (
                <span className="status-pending many">{pending} paquetes pendientes</span>
              )}
              <span className="status-sep">|</span>
              <span className="status-done">
                {done} recogido{done === 1 ? '' : 's'}
              </span>
            </span>
            <span className="ge-client-last">
              Último ingreso: <strong className="last-time">{last}</strong>
            </span>
          </span>
          {pending > 1 && (
            <span
              className="ge-multipack-badge"
              title={`Este cliente tiene ${pending} paquetes pendientes`}
            >
              {pending} paq.
            </span>
          )}
        </button>
      );
    });
  };

  const renderPackages = () => {
    if (!selectedClient) return null;
    return (
      <div id="cliente-profile" className="ge-profile">
        <div className="ge-profile-top">
          <div>
            <span className="ge-section-kicker">Ficha del cliente</span>
            <h2 id="cliente-name">{selectedClient.nombre || 'Sin nombre'}</h2>
            <div className="ge-profile-data">
              <div>
                <span>Teléfono</span>
                <strong id="cliente-phone">{selectedClient.telefono || 'No registrado'}</strong>
              </div>
              <div>
                <span>Sede</span>
                <strong id="cliente-sede">
                  {selectedClient.sede_nombre || user?.sede_nombre || 'La Merced'}
                </strong>
              </div>
            </div>
          </div>
          <button
            id="btn-export-entregas"
            className="ge-export-btn"
            type="button"
            disabled={!packages.length}
            onClick={exportCsv}
          >
            Exportar
          </button>
        </div>

        <div className="ge-metrics">
          <article>
            <span className="ge-metric-icon blue">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4Z" />
                <path d="M3.3 7 12 12l8.7-5" />
              </svg>
            </span>
            <div>
              <small>Pendientes por recoger</small>
              <strong id="profile-pending">{pendingPkgs.length}</strong>
            </div>
          </article>
          <article>
            <span className="ge-metric-icon green">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="m8 12 2.7 2.7L16.5 9" />
              </svg>
            </span>
            <div>
              <small>Recogidos</small>
              <strong id="profile-done">{donePkgs.length}</strong>
            </div>
          </article>
          <article>
            <span className="ge-metric-icon amber">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </span>
            <div>
              <small>Último paquete ingresado</small>
              <strong id="profile-last">{lastIngreso ? formatRelativeDate(lastIngreso) : '-'}</strong>
            </div>
          </article>
        </div>

        <div className="ge-profile-tables-grid">
          <section className="ge-table-section">
            <div className="ge-table-title">
              <h3>Pendientes</h3>
              <span id="pending-package-count">{pendingPkgs.length}</span>
            </div>
            <div className="ge-table-wrap">
              <table className="ge-mini-table">
                <thead>
                  <tr>
                    <th style={{ width: '180px' }}>Código</th>
                    <th style={{ width: '130px' }}>Ruta</th>
                    <th style={{ width: '110px' }}>Fecha ingreso</th>
                    <th style={{ width: '80px' }}>Peso</th>
                    <th style={{ width: '100px' }}>Tipo</th>
                    <th style={{ width: '90px' }}>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody id="pending-packages">
                  {pendingPkgs.length ? (
                    pendingPkgs.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="ge-code-badge">{item.codigo_paquete || 'Sin código'}</span>
                        </td>
                        <td><span className="ge-route-name">{routeLabel(item)}</span></td>
                        <td>{formatRelativeDate(item.fecha_ingreso)}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatWeight(item.peso_kg)}</td>
                        <td>
                          <span
                            className={`ge-package-type size-${packageTypeCode(item)}`}
                            title={packageDetail(item)}
                          >
                            {packageTypeLabel(item)}
                          </span>
                        </td>
                        <td><span className="ge-status-pill">Disponible</span></td>
                        <td className="ge-row-actions-cell">
                          <button className="ge-row-action" type="button" onClick={() => openDeliveryModal(item)}>
                            Marcar recogido
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="ge-table-empty" colSpan={7}>
                        Este cliente no tiene paquetes pendientes por recoger.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ge-table-section history">
            <div className="ge-table-title">
              <h3>Historial</h3>
              <span id="done-package-count">{donePkgs.length}</span>
            </div>
            <div className="ge-table-wrap">
              <table className="ge-mini-table ge-history-table">
                <thead>
                  <tr>
                    <th style={{ width: '180px' }}>Código</th>
                    <th style={{ width: '130px' }}>Ruta</th>
                    <th style={{ width: '80px' }}>Peso</th>
                    <th style={{ width: '100px' }}>Tipo</th>
                    <th>Detalle</th>
                    <th style={{ width: '100px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody id="done-packages">
                  {donePkgs.length ? (
                    donePkgs.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="ge-code-badge">{item.codigo_paquete || 'Sin código'}</span>
                        </td>
                        <td><span className="ge-route-name">{routeLabel(item)}</span></td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatWeight(item.peso_kg)}</td>
                        <td>
                          <span
                            className={`ge-package-type size-${packageTypeCode(item)}`}
                            title={packageDetail(item)}
                          >
                            {packageTypeLabel(item)}
                          </span>
                        </td>
                        <td>Recogido en oficina</td>
                        <td className="ge-row-actions-cell">
                          <button className="ge-row-action" type="button" onClick={() => markPending(item.id)}>
                            Revertir
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="ge-table-empty" colSpan={6}>
                        Todavía no hay paquetes recogidos para este cliente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    );
  };

  return (
    <main className="main" id="main-content">
      <header className="topbar">
        <div className="header-title-container">
          <div className="header-icon-box">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M9 14l2 2 4-4" />
            </svg>
          </div>
          <div>
            <div className="topbar-title">
              Gestión de Entregas
              <span className="topbar-stats" id="topbar-stats-header">
                <span className="topbar-stat topbar-stat--pending" id="topbar-pending">
                  {stats.pendientes}
                </span>
                <span className="topbar-stat topbar-stat--done" id="topbar-done">
                  {stats.recogidos}
                </span>
              </span>
            </div>
            <div className="topbar-sub">Módulo de entregas físicas y recojo en oficina</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="topbar-date" id="current-date">
            {currentDate}
          </span>
          <div className="user-role-badge">
            <span className="status-dot" />
            <span id="user-rol-topbar">
              {user?.rol || 'Encargado de Oficina'}
            </span>
          </div>
        </div>
      </header>

      <main className="ge-page">
        <section className="ge-shell" aria-label="Gestion de entregas">
          <aside className="ge-left-card">
            <form onSubmit={handleSearchSubmit}>
              <div className="ge-search-box">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <label className="sr-only" htmlFor="input-entrega-search">
                  Buscar cliente
                </label>
                <input
                  id="input-entrega-search"
                  ref={searchInputRef}
                  type="search"
                  autoComplete="off"
                  placeholder="Buscar cliente por nombre, teléfono o código"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    id="btn-clear-search"
                    className="ge-icon-button"
                    type="button"
                    title="Limpiar búsqueda"
                    aria-label="Limpiar búsqueda"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="ge-filter-strip">
                <label>
                  <span>Estado</span>
                  <select
                    value={filterEstado}
                    onChange={(e) => setFilterEstado(e.target.value)}
                  >
                    <option value="">Todos</option>
                    <option value="pendiente">Pendientes</option>
                    <option value="recogido">Recogidos</option>
                  </select>
                </label>
                <label>
                  <span>Fecha</span>
                  <select
                    value={filterFecha}
                    onChange={(e) => setFilterFecha(e.target.value)}
                  >
                    <option value="">Todas</option>
                    <option value="hoy">Hoy</option>
                    <option value="ayer">Ayer</option>
                    <option value="7dias">7 días</option>
                    <option value="30dias">30 días</option>
                  </select>
                </label>
                <label>
                  <span>Ruta</span>
                  <select
                    value={filterLote}
                    onChange={(e) => setFilterLote(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre_lote || `Ruta ${r.id}`}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="ge-search-actions">
                <button
                  id="btn-search-entregas"
                  className="ge-primary-btn"
                  type="submit"
                  disabled={searchLoading}
                >
                  {searchLoading ? 'Buscando...' : 'Buscar'}
                </button>
                <button
                  id="btn-reset-filters"
                  className="ge-ghost-btn"
                  type="button"
                  onClick={resetFilters}
                >
                  Limpiar
                </button>
              </div>
            </form>

            <div className="ge-list-header">
              <div>
                <h1>Clientes encontrados</h1>
                <p id="results-meta">
                  {hasSearched
                    ? clients.length
                      ? searchQuery.trim()
                        ? `Resultados para "${searchQuery.trim()}"`
                        : `${clients.length} clientes encontrados`
                      : 'No se encontraron clientes con esos datos.'
                    : 'Busca por apellido, nombre, teléfono o código.'}
                </p>
              </div>
            </div>

            <div id="clientes-list" className="ge-client-list">
              {renderClientList()}
            </div>
          </aside>

          <section className="ge-right-card">
            {profileLoading ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  padding: '40px',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: '3px solid #e2e8f0',
                    borderTopColor: '#117a34',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }}
                />
                <span
                  style={{
                    marginTop: 12,
                    fontSize: '0.85rem',
                    color: '#64748b',
                  }}
                >
                  Cargando ficha del cliente...
                </span>
              </div>
            ) : selectedClient ? (
              renderPackages()
            ) : (
              <div id="cliente-profile-empty" className="ge-profile-empty">
                <div className="ge-welcome-top">
                  <div className="ge-welcome-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      <path d="M9 14l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h2>Entregas en Oficina</h2>
                    <p className="ge-welcome-sub">Busca, selecciona y confirma entregas</p>
                  </div>
                </div>

                <div className="ge-flow">
                  <div className="ge-flow-step">
                    <span className="ge-flow-num">1</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                    <span className="ge-flow-label">Buscar</span>
                  </div>
                  <div className="ge-flow-line" />
                  <div className="ge-flow-step">
                    <span className="ge-flow-num">2</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    <span className="ge-flow-label">Seleccionar</span>
                  </div>
                  <div className="ge-flow-line" />
                  <div className="ge-flow-step">
                    <span className="ge-flow-num">3</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span className="ge-flow-label">Entregar</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </section>
      </main>

      <div
        id="delivery-modal"
        className={`ge-modal-overlay${showModal ? ' open' : ''}`}
        aria-hidden={!showModal}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div className="ge-modal" role="dialog" aria-modal="true" aria-labelledby="delivery-modal-title">
          <div className="ge-modal-head">
            <h2 id="delivery-modal-title">Confirmar entrega</h2>
            <button
              id="delivery-modal-close"
              className="ge-icon-button"
              type="button"
              aria-label="Cerrar"
              onClick={closeModal}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div className="ge-modal-body">
            <dl>
              <div>
                <dt>Cliente:</dt>
                <dd id="modal-client-name">{selectedClient?.nombre || '-'}</dd>
              </div>
              <div>
                <dt>Código:</dt>
                <dd id="modal-package-code">
                  {packages.find((p) => p.id === pendingDeliveryId)?.codigo_paquete || '-'}
                </dd>
              </div>
              <div>
                <dt>Ruta:</dt>
                <dd id="modal-package-route">
                  {routeLabel(packages.find((p) => p.id === pendingDeliveryId) || ({} as PackageItem))}
                </dd>
              </div>
              <div>
                <dt>Peso:</dt>
                <dd id="modal-package-weight">
                  {formatWeight(packages.find((p) => p.id === pendingDeliveryId)?.peso_kg)}
                </dd>
              </div>
              <div>
                <dt>Tipo:</dt>
                <dd id="modal-package-type">
                  {packageTypeLabel(packages.find((p) => p.id === pendingDeliveryId) || ({} as PackageItem))}
                </dd>
              </div>
              <div>
                <dt>Fecha ingreso:</dt>
                <dd id="modal-package-date">
                  {formatDate(packages.find((p) => p.id === pendingDeliveryId)?.fecha_ingreso ?? null)}
                </dd>
              </div>
            </dl>
            <label className="ge-modal-field">
              <span>Observación:</span>
              <textarea
                ref={observationRef}
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                rows={4}
                placeholder="Entregado con DNI físico"
              />
            </label>
          </div>
          <div className="ge-modal-actions">
            <button
              id="delivery-modal-cancel"
              className="ge-ghost-btn"
              type="button"
              onClick={closeModal}
            >
              Cancelar
            </button>
            <button
              id="delivery-modal-confirm"
              className="ge-primary-btn"
              type="button"
              disabled={confirming}
              onClick={confirmDelivery}
            >
              {confirming ? 'Confirmando...' : 'Confirmar entrega'}
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      )}
    </main>
  );
};
