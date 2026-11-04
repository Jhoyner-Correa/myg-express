import React, { useEffect, useMemo, useState } from 'react';
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
      // Filtro por estado
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }
      // Filtro por texto
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
    // Recalcular resumen
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
        return <span className={styles.statusBadgeConFotos}>✓ Con fotos</span>;
      case 'SIN_FOTOS':
        return <span className={styles.statusBadgeSinFotos}>⚠ Sin fotos</span>;
      case 'SIN_DETALLE_RUTA':
        return <span className={styles.statusBadgeSinDetalle}>⚡ Sin detalle ruta</span>;
      case 'NO_ENCONTRADA':
        return <span className={styles.statusBadgeNoEncontrada}>✕ No encontrada</span>;
      case 'ERROR':
      default:
        return <span className={styles.statusBadgeError}>! Error</span>;
    }
  };

  return (
    <div className={styles.page}>
      {/* Header Corporativo */}
      <header className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h1>Gestión Masiva de Fotografías de Guías – Urbano</h1>
          <span className={styles.headerSubtitle}>
            Consulta, visualización, subida y eliminación de fotos asociadas a guías de distribución
          </span>
        </div>

        <div className={styles.headerControls}>
          <div className={styles.siteSelectWrapper}>
            <label htmlFor="site-select" className={styles.siteSelectLabel}>
              Sede operativa:
            </label>
            <select
              id="site-select"
              value={selectedSiteId || ''}
              onChange={(e) => setSelectedSiteId(Number(e.target.value))}
              className={styles.siteSelect}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.integrationStatus === 'activo' ? '(Urbano Activo)' : '(Sin credenciales)'}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <div className={styles.content}>
        {/* KPI Summary Cards */}
        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total Consultadas</span>
            <span className={styles.kpiValue}>{summary.total}</span>
          </div>
          <div className={`${styles.kpiCard} ${styles.kpiConFotos}`}>
            <span className={styles.kpiLabel}>Con Fotografías</span>
            <span className={styles.kpiValue}>{summary.conFotos}</span>
          </div>
          <div className={`${styles.kpiCard} ${styles.kpiSinFotos}`}>
            <span className={styles.kpiLabel}>Sin Fotografías</span>
            <span className={styles.kpiValue}>{summary.sinFotos}</span>
          </div>
          <div className={`${styles.kpiCard} ${styles.kpiSinDetalle}`}>
            <span className={styles.kpiLabel}>Sin Detalle Ruta</span>
            <span className={styles.kpiValue}>{summary.sinDetalleRuta}</span>
          </div>
          <div className={`${styles.kpiCard} ${styles.kpiErrores}`}>
            <span className={styles.kpiLabel}>No Encontradas / Error</span>
            <span className={styles.kpiValue}>{summary.noEncontradas + summary.errores}</span>
          </div>
        </section>

        {/* Workspace Dual Pane */}
        <div className={styles.workspace}>
          {/* Panel Izquierdo: Consola de Ingesta */}
          <aside className={styles.sidebarPanel}>
            <h3 className={styles.sidebarTitle}>Ingreso Masivo de Guías</h3>

            <div className={styles.fieldGroup}>
              <label htmlFor="route_id_input" className={styles.fieldLabel}>
                Ruta / Manifiesto Urbano (Opcional):
              </label>
              <input
                id="route_id_input"
                type="text"
                placeholder="Ejemplo: 1164838"
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className={styles.textInput}
              />
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.guideCounterRow}>
                <label htmlFor="guides_textarea" className={styles.fieldLabel}>
                  Guías (una por línea o pegadas de Excel):
                </label>
                <span className={styles.guideCounterCount}>
                  {detectedGuideCount} guías detectadas
                </span>
              </div>
              <textarea
                id="guides_textarea"
                placeholder="WYB477212514&#10;WYB478229399&#10;WYB478229400..."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className={styles.textAreaInput}
              />
            </div>

            <div className={styles.guideCounterRow}>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={handleLoadExample}
              >
                Cargar guías de ejemplo
              </button>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  setRawText('');
                  setErrorMsg(null);
                }}
              >
                Limpiar campo
              </button>
            </div>

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleConsultar}
                disabled={isLoading || !rawText.trim()}
              >
                {isLoading ? 'Consultando en Urbano...' : '🔍 Consultar Fotografías'}
              </button>
            </div>

            {errorMsg && <div className={styles.alertError}>{errorMsg}</div>}

            <div className={styles.helperBox}>
              <strong>Formatos admitidos:</strong>
              <ul>
                <li>Códigos de guía WYB (uno por línea).</li>
                <li>Columnas copiadas directamente de Excel.</li>
                <li>Pares directos: <code>GUIA,man_id_det</code>.</li>
                <li>Normalización automática y deduplicación.</li>
              </ul>
            </div>
          </aside>

          {/* Panel Derecho: Tabla de Resultados e Historial */}
          <main className={styles.mainPanel}>
            <div className={styles.mainPanelHeader}>
              <div className={styles.navTabs}>
                <button
                  type="button"
                  className={`${styles.navTab} ${activeTab === 'RESULTS' ? styles.navTabActive : ''}`}
                  onClick={() => setActiveTab('RESULTS')}
                >
                  Resultados de Guías ({filteredResults.length})
                </button>
                <button
                  type="button"
                  className={`${styles.navTab} ${activeTab === 'HISTORY' ? styles.navTabActive : ''}`}
                  onClick={() => setActiveTab('HISTORY')}
                >
                  Historial de Auditoría
                </button>
              </div>

              {activeTab === 'RESULTS' && (
                <div className={styles.filterControls}>
                  <input
                    type="text"
                    placeholder="Filtrar por guía, cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.searchInput}
                  />

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
                      className={styles.secondaryBtn}
                      onClick={handleExportCsv}
                      title="Exportar listado a archivo CSV"
                    >
                      📥 Exportar CSV
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'HISTORY' && (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={loadHistory}
                  disabled={isLoadingHistory}
                >
                  {isLoadingHistory ? 'Actualizando...' : '🔄 Actualizar Bitácora'}
                </button>
              )}
            </div>

            {/* Vista 1: Tabla de Resultados */}
            {activeTab === 'RESULTS' && (
              <div className={styles.tableContainer}>
                {results.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>📷</div>
                    <h3>Sin consultas realizadas</h3>
                    <p>
                      Pega una lista de guías en el panel izquierdo y presiona <strong>Consultar Fotografías</strong> para procesar.
                    </p>
                  </div>
                ) : filteredResults.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No hay guías que coincidan con los filtros aplicados.</p>
                  </div>
                ) : (
                  <table className={styles.resultsTable}>
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
                          <td className={styles.guideCell}>{item.guia}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <strong>{item.destinatario || '—'}</strong>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
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
                                <span className={styles.missingBadge}>Sin ID</span>
                              )}
                              {item.route_id && (
                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  Ruta: {item.route_id}
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span className={styles.photoCountPill}>
                              📷 {item.fotos_count} foto{item.fotos_count === 1 ? '' : 's'}
                            </span>
                          </td>
                          <td>{renderStatusBadge(item.status)}</td>
                          <td>
                            <div className={styles.tableActions}>
                              <button
                                type="button"
                                className={styles.viewPhotosBtn}
                                onClick={() => setActiveGuideForGallery(item)}
                                title="Ver galería y subir fotografías"
                              >
                                {item.man_id_det ? '🖼 Ver / Subir' : 'Ver ficha'}
                              </button>

                              {!item.man_id_det && (
                                <button
                                  type="button"
                                  className={styles.assignRouteBtn}
                                  onClick={() => setActiveGuideForAssign(item)}
                                  title="Asignar ruta o man_id_det"
                                >
                                  ⚡ Asignar ID
                                </button>
                              )}

                              <button
                                type="button"
                                className={styles.secondaryBtn}
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
              <div className={styles.tableContainer}>
                {historyLogs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No se registran operaciones recientes en la bitácora.</p>
                  </div>
                ) : (
                  <table className={styles.resultsTable}>
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
                          <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                            {new Date(log.created_at).toLocaleString('es-PE')}
                          </td>
                          <td>{log.usuario_nombre || `ID ${log.usuario_id}`}</td>
                          <td>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '0.72rem',
                                color:
                                  log.tipo_operacion === 'SUBIDA'
                                    ? '#16a34a'
                                    : log.tipo_operacion === 'ELIMINACION'
                                    ? '#dc2626'
                                    : '#2563eb',
                              }}
                            >
                              {log.tipo_operacion}
                            </span>
                          </td>
                          <td className={styles.guideCell}>{log.guia}</td>
                          <td>{log.man_id_det || '—'}</td>
                          <td>
                            <span
                              style={{
                                fontWeight: 600,
                                fontSize: '0.72rem',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: log.resultado === 'EXITOSO' ? '#dcfce7' : '#fee2e2',
                                color: log.resultado === 'EXITOSO' ? '#15803d' : '#b91c1c',
                              }}
                            >
                              {log.resultado}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.75rem', color: '#475569' }}>
                            {log.mensaje || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </main>
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
    </div>
  );
};

export default UrbanoGuidePhotos;
