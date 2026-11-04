import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Package,
  PackageSearch,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
} from 'lucide-react';
import type {
  AuditLogEntry,
  UrbanoGuidePhotoStatus,
  UrbanoGuidePhotosResult,
  UrbanoPhotosSummary,
  UrbanoSiteOption,
} from './types';
import { urbanoPhotosService } from './urbanoPhotos.service';
import { PhotoGalleryDrawer } from './PhotoGalleryDrawer';
import { AssignRouteModal } from './AssignRouteModal';
import { PageHeader } from '../../../components/ui/PageHeader/PageHeader';
import styles from './UrbanoGuidePhotos.module.css';

export const UrbanoGuidePhotos: React.FC = () => {
  // Sede & Config
  const [sites, setSites] = useState<UrbanoSiteOption[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [routeId, setRouteId] = useState<string>('');
  const [rawText, setRawText] = useState<string>('');

  // Estados de consulta
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<UrbanoGuidePhotosResult[]>([]);
  const [summary, setSummary] = useState<UrbanoPhotosSummary>({
    total: 0,
    conFotos: 0,
    sinFotos: 0,
    sinDetalleRuta: 0,
    noEncontradas: 0,
    errores: 0,
  });

  // Pestañas y filtros
  const [activeTab, setActiveTab] = useState<'RESULTS' | 'HISTORY'>('RESULTS');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Historial
  const [historyLogs, setHistoryLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Drawer & Modales
  const [activeGuideForGallery, setActiveGuideForGallery] = useState<UrbanoGuidePhotosResult | null>(null);
  const [activeGuideForAssign, setActiveGuideForAssign] = useState<UrbanoGuidePhotosResult | null>(null);

  // 1. Cargar sedes al montar
  useEffect(() => {
    let isMounted = true;
    urbanoPhotosService
      .fetchSites()
      .then((data) => {
        if (!isMounted) return;
        setSites(data);
        const activeSite = data.find((s) => s.integrationStatus === 'activo') || data[0];
        if (activeSite) setSelectedSiteId(activeSite.id);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Error al cargar sedes:', err);
        setErrorMsg('No se pudieron cargar las sedes con integración Urbano.');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId]
  );

  // 2. Contador de guías en tiempo real
  const detectedGuideCount = useMemo(() => {
    if (!rawText.trim()) return 0;
    const tokens = rawText
      .split(/[\r\n,;\t]+/)
      .map((t) => t.trim().toUpperCase())
      .filter((t) => /^WYB\d+/i.test(t) || /^\d{7,15}$/.test(t));
    return new Set(tokens).size;
  }, [rawText]);

  // 3. Ejecutar consulta masiva
  const handleConsultar = async () => {
    if (!selectedSiteId) {
      setErrorMsg('Selecciona una sede con credenciales activas.');
      return;
    }
    if (!rawText.trim()) {
      setErrorMsg('Ingresa o pega las guías para consultar.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await urbanoPhotosService.consultarGuias(
        selectedSiteId,
        rawText,
        routeId.trim() || undefined
      );

      setResults(res.data);
      setSummary(res.summary);
      setActiveTab('RESULTS');
    } catch (err: any) {
      console.error('Error en consulta masiva:', err);
      setErrorMsg(err?.message || 'Error al procesar la consulta en Urbano.');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Cargar ejemplo
  const handleLoadExample = () => {
    setRouteId('1164838');
    setRawText('WYB477212514\nWYB478229399');
    setErrorMsg(null);
  };

  // 5. Cargar historial
  const loadHistory = async () => {
    if (!selectedSiteId) return;
    setIsLoadingHistory(true);
    try {
      const data = await urbanoPhotosService.obtenerHistorial(selectedSiteId, undefined, 100);
      setHistoryLogs(data);
    } catch (err) {
      console.error('Error al cargar historial:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'HISTORY') {
      loadHistory();
    }
  }, [activeTab, selectedSiteId]);

  // 6. Filtrar resultados
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchGuide = item.guia.toLowerCase().includes(query);
        const matchRecipient = (item.destinatario || '').toLowerCase().includes(query);
        const matchDest = (item.destino || '').toLowerCase().includes(query);
        const matchManId = (item.man_id_det || '').toLowerCase().includes(query);
        const matchTrack = (item.estado_rastreo || '').toLowerCase().includes(query);
        if (!matchGuide && !matchRecipient && !matchDest && !matchManId && !matchTrack) {
          return false;
        }
      }
      return true;
    });
  }, [results, statusFilter, searchTerm]);

  // 7. Actualización tras cambios en el Drawer
  const handleGuideUpdated = (updated: UrbanoGuidePhotosResult) => {
    setResults((prev) =>
      prev.map((r) => (r.guia === updated.guia ? updated : r))
    );
    if (activeGuideForGallery && activeGuideForGallery.guia === updated.guia) {
      setActiveGuideForGallery(updated);
    }
    setSummary(() => {
      const all = results.map((r) => (r.guia === updated.guia ? updated : r));
      return {
        total: all.length,
        conFotos: all.filter((r) => r.status === 'CON_FOTOS').length,
        sinFotos: all.filter((r) => r.status === 'SIN_FOTOS').length,
        sinDetalleRuta: all.filter((r) => r.status === 'SIN_DETALLE_RUTA').length,
        noEncontradas: all.filter((r) => r.status === 'NO_ENCONTRADA').length,
        errores: all.filter((r) => r.status === 'ERROR').length,
      };
    });
  };

  // 8. Reconsultar una guía específica
  const handleRecheckSingleGuide = async (guideItem: UrbanoGuidePhotosResult) => {
    if (!selectedSiteId) return;
    try {
      const res = await urbanoPhotosService.consultarGuias(
        selectedSiteId,
        guideItem.guia,
        guideItem.route_id || routeId || undefined
      );
      if (res.data[0]) {
        handleGuideUpdated(res.data[0]);
      }
    } catch (err: any) {
      alert(`Error al reconsultar guía: ${err?.message || 'Error desconocido'}`);
    }
  };

  // 9. Exportar a CSV
  const handleExportCsv = () => {
    if (!results.length) return;
    const headers = [
      'Guía',
      'gui_numero',
      'man_id_det',
      'Ruta',
      'Destinatario',
      'Destino',
      'Estado Rastreo',
      'Estado Fotos',
      'Total Fotos',
      'URLs Fotos',
    ];

    const rows = results.map((r) => [
      `"${r.guia}"`,
      `"${r.gui_numero || ''}"`,
      `"${r.man_id_det || ''}"`,
      `"${r.route_id || ''}"`,
      `"${(r.destinatario || '').replace(/"/g, '""')}"`,
      `"${(r.destino || '').replace(/"/g, '""')}"`,
      `"${(r.estado_rastreo || '').replace(/"/g, '""')}"`,
      `"${r.status}"`,
      r.fotos_count,
      `"${r.fotos.map((f) => f.img_path).join(' ; ')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fotos_Guias_Urbano_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderStatusBadge = (status: UrbanoGuidePhotoStatus) => {
    switch (status) {
      case 'CON_FOTOS':
        return (
          <span className={`${styles.pillStatus} ${styles.pillConFotos}`}>
            <i /> Con fotos
          </span>
        );
      case 'SIN_FOTOS':
        return (
          <span className={`${styles.pillStatus} ${styles.pillSinFotos}`}>
            <i /> Sin fotos
          </span>
        );
      case 'SIN_DETALLE_RUTA':
        return (
          <span className={`${styles.pillStatus} ${styles.pillSinDetalle}`}>
            <i /> Sin detalle ruta
          </span>
        );
      case 'NO_ENCONTRADA':
        return (
          <span className={`${styles.pillStatus} ${styles.pillNoEncontrada}`}>
            <i /> No encontrada
          </span>
        );
      case 'ERROR':
      default:
        return (
          <span className={`${styles.pillStatus} ${styles.pillError}`}>
            <i /> Error
          </span>
        );
    }
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      {/* Header Corporativo con PageHeader estándar de MyG Express */}
      <PageHeader
        icon={<Camera />}
        title="Fotos de Guías Urbano"
        subtitle="Consulta masiva, visualización, carga y eliminación de fotografías de guías"
        metadata={
          <div className={styles.headerMeta}>
            <span>
              <ShieldCheck size={14} color="#15803d" />
              Acceso Administrador
            </span>
            <span>
              <i />
              Urbano SCM API
            </span>
          </div>
        }
      />

      {/* Contenido Principal */}
      <div className={styles.content}>
        <div className={styles.workspace}>
          {/* ========================================================
              PANEL IZQUIERDO: CONSOLA DE INGESTA
              ======================================================== */}
          <aside className={styles.sidebarPanel} aria-label="Ingesta de Guías">
            <div className={styles.controlCard}>
              <div className={styles.cardHeading}>
                <div className={styles.cardHeadingLeft}>
                  <div className={styles.cardIconWrap}>
                    <PackageSearch size={16} />
                  </div>
                  <div>
                    <span className={styles.eyebrow}>CONSULTA DIRECTA</span>
                    <h3>Fotografías Urbano</h3>
                  </div>
                </div>
              </div>

              {/* Sede Operativa */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabel}>
                  <span>Sede Operativa</span>
                  {selectedSite && (
                    <span
                      className={
                        selectedSite.available
                          ? `${styles.statusIndicator} ${styles.statusIndicatorOk}`
                          : `${styles.statusIndicator} ${styles.statusIndicatorWarn}`
                      }
                    >
                      <i /> {selectedSite.available ? 'En línea' : 'Sin acceso'}
                    </span>
                  )}
                </div>
                <div className={styles.selectShell}>
                  <Building2 size={15} />
                  <select
                    id="photos-site-select"
                    className={styles.siteSelect}
                    value={selectedSiteId || ''}
                    onChange={(e) => setSelectedSiteId(Number(e.target.value))}
                    disabled={isLoading}
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id} disabled={!s.available}>
                        {s.name} {!s.available ? '(Sin credenciales)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ruta / Manifiesto Urbano (Opcional) */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabel}>
                  <span>Ruta / Manifiesto (Opcional)</span>
                </div>
                <div className={styles.textInputShell}>
                  <Truck size={15} />
                  <input
                    id="photos-route-input"
                    type="text"
                    placeholder="Ejemplo: 1164838"
                    value={routeId}
                    onChange={(e) => setRouteId(e.target.value)}
                    className={styles.routeInput}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Textarea para Códigos de Guía */}
              <div className={styles.textareaSection}>
                <div className={styles.textareaHeader}>
                  <label htmlFor="photos-guide-textarea">Códigos de Guía</label>
                  <span
                    className={
                      detectedGuideCount > 0
                        ? `${styles.detectedCountBadge} ${styles.badgeActive}`
                        : `${styles.detectedCountBadge} ${styles.badgeNeutral}`
                    }
                  >
                    {detectedGuideCount > 0 ? `✓ ${detectedGuideCount} guías` : '0 guías'}
                  </span>
                </div>

                <textarea
                  id="photos-guide-textarea"
                  className={styles.textarea}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  disabled={isLoading}
                  placeholder={`WYB477212514\nWYB478229399\nWYB478229400...`}
                />

                <div className={styles.textareaActions}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={handleLoadExample}
                    disabled={isLoading}
                    title="Cargar guías de ejemplo"
                  >
                    Ejemplo WYB
                  </button>

                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => {
                      setRawText('');
                      setErrorMsg(null);
                    }}
                    disabled={isLoading || !rawText}
                    title="Limpiar entrada"
                  >
                    <Trash2 size={12} />
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Botón Principal de Consulta */}
              <button
                type="button"
                className={styles.btnAuditPrimary}
                onClick={handleConsultar}
                disabled={isLoading || detectedGuideCount === 0 || !selectedSiteId}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={15} className={styles.spin} />
                    Consultando en Urbano...
                  </>
                ) : (
                  <>
                    <Search size={15} />
                    Consultar {detectedGuideCount > 0 ? `${detectedGuideCount} Guías` : 'Fotografías'}
                  </>
                )}
              </button>

              {errorMsg && <div className={styles.alertError}>{errorMsg}</div>}

              <div className={styles.helperBox}>
                <strong>Tipos de ingesta aceptados:</strong>
                <ul>
                  <li>Guías WYB (una por línea o pegadas de Excel).</li>
                  <li>Pares directos: <code>GUIA,man_id_det</code>.</li>
                  <li>Normalización y deduplicación automática.</li>
                </ul>
              </div>
            </div>
          </aside>

          {/* ========================================================
              PANEL DERECHO: CONSOLA DE RESULTADOS
              ======================================================== */}
          <section className={styles.mainPanel} aria-label="Resultados de Fotografías">
            {/* Barra Superior de Métricas (KPIs) */}
            <div className={styles.metricsBar}>
              <div className={styles.metricCard}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>Total Consultadas</span>
                  <Package size={13} color="#64748b" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{summary.total}</span>
                  <span className={styles.metricPct}>guías</span>
                </div>
                <span className={styles.metricFoot}>
                  {summary.total > 0 ? 'Lote procesado' : 'Sin lote activo'}
                </span>
              </div>

              <div className={`${styles.metricCard} ${styles.metricConFotos}`}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>Con Fotos</span>
                  <CheckCircle2 size={13} color="#15803d" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{summary.conFotos}</span>
                  <span className={styles.metricPct}>
                    ({summary.total > 0 ? Math.round((summary.conFotos / summary.total) * 100) : 0}%)
                  </span>
                </div>
                <span className={styles.metricFoot}>Fotos confirmadas</span>
              </div>

              <div className={`${styles.metricCard} ${styles.metricSinFotos}`}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>Sin Fotos</span>
                  <Clock size={13} color="#b45309" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{summary.sinFotos}</span>
                  <span className={styles.metricPct}>
                    ({summary.total > 0 ? Math.round((summary.sinFotos / summary.total) * 100) : 0}%)
                  </span>
                </div>
                <span className={styles.metricFoot}>Pendientes de carga</span>
              </div>

              <div className={`${styles.metricCard} ${styles.metricSinDetalle}`}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>Sin Detalle Ruta</span>
                  <Truck size={13} color="#6d28d9" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{summary.sinDetalleRuta}</span>
                  <span className={styles.metricPct}>
                    ({summary.total > 0 ? Math.round((summary.sinDetalleRuta / summary.total) * 100) : 0}%)
                  </span>
                </div>
                <span className={styles.metricFoot}>Requiere ruta / ID</span>
              </div>

              <div className={`${styles.metricCard} ${styles.metricErrores}`}>
                <div className={styles.metricTop}>
                  <span className={styles.metricLabel}>No Encontrada/Error</span>
                  <AlertCircle size={13} color="#b91c1c" />
                </div>
                <div className={styles.metricValueGroup}>
                  <span className={styles.metricNum}>{summary.noEncontradas + summary.errores}</span>
                  <span className={styles.metricPct}>
                    ({summary.total > 0 ? Math.round(((summary.noEncontradas + summary.errores) / summary.total) * 100) : 0}%)
                  </span>
                </div>
                <span className={styles.metricFoot}>Revisar en Urbano</span>
              </div>
            </div>

            {/* Barra de Filtros, Pestañas y Acciones */}
            <div className={styles.toolbar}>
              <div className={styles.tabGroup}>
                <button
                  type="button"
                  className={`${styles.tabItem} ${activeTab === 'RESULTS' ? styles.tabItemActive : ''}`}
                  onClick={() => setActiveTab('RESULTS')}
                >
                  Resultados de Guías ({filteredResults.length})
                </button>
                <button
                  type="button"
                  className={`${styles.tabItem} ${activeTab === 'HISTORY' ? styles.tabItemActive : ''}`}
                  onClick={() => setActiveTab('HISTORY')}
                >
                  Historial de Auditoría
                </button>
              </div>

              {activeTab === 'RESULTS' && (
                <div className={styles.toolbarRight}>
                  <div className={styles.searchBox}>
                    <Search size={13} />
                    <input
                      type="text"
                      placeholder="Buscar guía, cliente, destino..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={styles.searchInput}
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={styles.statusFilterSelect}
                  >
                    <option value="ALL">Todos los estados</option>
                    <option value="CON_FOTOS">Con fotos</option>
                    <option value="SIN_FOTOS">Sin fotos</option>
                    <option value="SIN_DETALLE_RUTA">Sin detalle ruta</option>
                    <option value="NO_ENCONTRADA">No encontrada</option>
                    <option value="ERROR">Errores</option>
                  </select>

                  {results.length > 0 && (
                    <button
                      type="button"
                      className={styles.btnExport}
                      onClick={handleExportCsv}
                      title="Exportar listado a archivo CSV"
                    >
                      <Download size={13} />
                      Exportar CSV
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'HISTORY' && (
                <div className={styles.toolbarRight}>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={loadHistory}
                    disabled={isLoadingHistory}
                  >
                    <RefreshCw size={12} className={isLoadingHistory ? styles.spin : ''} />
                    {isLoadingHistory ? 'Actualizando...' : 'Actualizar Bitácora'}
                  </button>
                </div>
              )}
            </div>

            {/* Vista 1: Tabla de Resultados de Guías */}
            {activeTab === 'RESULTS' && (
              <div className={styles.tableWrap}>
                {results.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>
                      <Camera size={22} />
                    </div>
                    <h4>Sin consultas realizadas</h4>
                    <p>
                      Pega una lista de guías en el panel izquierdo y presiona <strong>Consultar Fotografías</strong> para procesar en Urbano.
                    </p>
                  </div>
                ) : filteredResults.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No hay guías que coincidan con los filtros aplicados.</p>
                  </div>
                ) : (
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>Guía</th>
                        <th>Destinatario / Destino</th>
                        <th>Estado Rastreo</th>
                        <th>man_id_det / Ruta</th>
                        <th>Fotografías</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((item) => (
                        <tr key={item.guia}>
                          <td>
                            <span className={styles.guideCode}>{item.guia}</span>
                            {item.gui_numero && (
                              <span className={styles.guideTracking}>Nº: {item.gui_numero}</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong>{item.destinatario || '—'}</strong>
                              <span style={{ fontSize: '9.5px', color: '#64748b' }}>
                                {item.destino || item.direccion || ''}
                              </span>
                            </div>
                          </td>
                          <td>{item.estado_rastreo || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {item.man_id_det ? (
                                <span className={styles.manIdBadge}>ID: {item.man_id_det}</span>
                              ) : (
                                <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '9.5px' }}>
                                  Sin ID
                                </span>
                              )}
                              {item.route_id && (
                                <span className={styles.routeBadge}>Ruta: {item.route_id}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span
                              className={
                                item.fotos_count > 0
                                  ? `${styles.photoBadge} ${styles.photoBadgeActive}`
                                  : styles.photoBadge
                              }
                            >
                              <Camera size={11} /> {item.fotos_count} foto{item.fotos_count === 1 ? '' : 's'}
                            </span>
                          </td>
                          <td>{renderStatusBadge(item.status)}</td>
                          <td>
                            <div className={styles.actionBtns}>
                              <button
                                type="button"
                                className={styles.btnActionView}
                                onClick={() => setActiveGuideForGallery(item)}
                                title="Ver galería y subir fotografías"
                              >
                                {item.man_id_det ? '🖼 Ver / Subir' : 'Ver Ficha'}
                              </button>

                              {!item.man_id_det && (
                                <button
                                  type="button"
                                  className={styles.btnActionAssign}
                                  onClick={() => setActiveGuideForAssign(item)}
                                  title="Asignar ruta o man_id_det"
                                >
                                  ⚡ Asignar ID
                                </button>
                              )}

                              <button
                                type="button"
                                className={styles.btnActionRefresh}
                                onClick={() => handleRecheckSingleGuide(item)}
                                title="Reconsultar esta guía en Urbano"
                              >
                                🔄
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Vista 2: Historial de Auditoría */}
            {activeTab === 'HISTORY' && (
              <div className={styles.tableWrap}>
                {historyLogs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No se registran operaciones recientes en la bitácora.</p>
                  </div>
                ) : (
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <th>Fecha / Hora</th>
                        <th>Usuario</th>
                        <th>Operación</th>
                        <th>Guía</th>
                        <th>man_id_det</th>
                        <th>Resultado</th>
                        <th>Mensaje / Detalles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ whiteSpace: 'nowrap', fontSize: '10px' }}>
                            {new Date(log.created_at).toLocaleString('es-PE')}
                          </td>
                          <td>{log.usuario_nombre || `ID ${log.usuario_id}`}</td>
                          <td>
                            <span
                              style={{
                                fontWeight: 800,
                                fontSize: '9.5px',
                                color:
                                  log.tipo_operacion === 'SUBIDA'
                                    ? '#15803d'
                                    : log.tipo_operacion === 'ELIMINACION'
                                    ? '#dc2626'
                                    : '#1d5fc7',
                              }}
                            >
                              {log.tipo_operacion}
                            </span>
                          </td>
                          <td>
                            <span className={styles.guideCode}>{log.guia}</span>
                          </td>
                          <td>{log.man_id_det || '—'}</td>
                          <td>
                            <span
                              className={`${styles.pillStatus} ${
                                log.resultado === 'EXITOSO' ? styles.pillConFotos : styles.pillError
                              }`}
                            >
                              <i /> {log.resultado}
                            </span>
                          </td>
                          <td style={{ fontSize: '10.5px', color: '#475569' }}>
                            {log.mensaje || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Drawer de Galería y Subida de Fotos */}
      {activeGuideForGallery && selectedSiteId && (
        <PhotoGalleryDrawer
          guide={activeGuideForGallery}
          siteId={selectedSiteId}
          isOpen={Boolean(activeGuideForGallery)}
          onClose={() => setActiveGuideForGallery(null)}
          onGuideUpdated={handleGuideUpdated}
        />
      )}

      {/* Modal para Asignar Ruta o man_id_det */}
      {activeGuideForAssign && selectedSiteId && (
        <AssignRouteModal
          guide={activeGuideForAssign}
          siteId={selectedSiteId}
          isOpen={Boolean(activeGuideForAssign)}
          onClose={() => setActiveGuideForAssign(null)}
          onSuccess={(manId, rId) => {
            const updated: UrbanoGuidePhotosResult = {
              ...activeGuideForAssign,
              man_id_det: manId || activeGuideForAssign.man_id_det,
              route_id: rId || activeGuideForAssign.route_id,
            };
            handleGuideUpdated(updated);
            handleRecheckSingleGuide(updated);
          }}
        />
      )}
    </main>
  );
};

export default UrbanoGuidePhotos;
