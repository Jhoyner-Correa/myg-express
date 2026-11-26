import React, { useEffect, useMemo, useState } from 'react';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Package,
  MapPin,
  Plus,
  ArrowLeft,
  Search,
  Check,
  Smartphone,
  ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../../components/ui/Modal/Modal';
import { Button } from '../../../../components/ui/Button/Button';
import { jntService } from '../jnt.service';
import type { JntAvailableRoute, JntBatchDetailData, JntSendToRouteResult } from '../types';
import styles from '../JntExpress.module.css';

interface JntWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchData: JntBatchDetailData;
  batchId: number;
  selectedGuias?: string[];
  onSentSuccess?: (result: JntSendToRouteResult) => void;
}

function formatRouteDateLabel(rawDate: string): string {
  const isoDay = String(rawDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return 'Hoy';
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  if (isoDay === todayIso) return 'Hoy';
  const [y, m, d] = isoDay.split('-');
  return `${d}/${m}/${y}`;
}

export const JntWhatsAppModal: React.FC<JntWhatsAppModalProps> = ({
  isOpen,
  onClose,
  batchData,
  batchId,
  selectedGuias = [],
  onSentSuccess,
}) => {
  const navigate = useNavigate();
  const cleanBatchBaseName = batchData.lote?.nombre_archivo
    ? batchData.lote.nombre_archivo.replace(/\.pdf$/i, '')
    : `J&T Express ${new Date().toLocaleDateString('es-PE').replace(/\//g, '-')}`;

  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing');
  const [availableRoutes, setAvailableRoutes] = useState<JntAvailableRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routeSearch, setRouteSearch] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [nombreRuta, setNombreRuta] = useState(cleanBatchBaseName);

  const [modoAgrupacion, setModoAgrupacion] = useState<'individual' | 'agrupado_por_cliente'>('individual');
  const [selectedDistritos, setSelectedDistritos] = useState<string[]>(Object.keys(batchData.distritos || {}));
  const [useSelectionOnly, setUseSelectionOnly] = useState<boolean>(selectedGuias.length > 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<JntSendToRouteResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessResult(null);
    setRouteSearch('');
    setUseSelectionOnly(selectedGuias.length > 0);
    setSelectedDistritos(Object.keys(batchData.distritos || {}));
    setNombreRuta(cleanBatchBaseName);

    let active = true;
    const fetchRoutes = async () => {
      try {
        setLoadingRoutes(true);
        const routes = await jntService.listAvailableRoutes();
        if (!active) return;
        setAvailableRoutes(routes);
        if (routes.length > 0) {
          setTargetMode('existing');
          const linkedRoute = batchData.lote?.lote_carga_id
            ? routes.find(r => r.id === batchData.lote?.lote_carga_id)
            : null;
          setSelectedRouteId(linkedRoute ? linkedRoute.id : routes[0]!.id);
        } else {
          setTargetMode('new');
          setSelectedRouteId(null);
        }
      } catch (err) {
        console.warn('No se pudieron cargar las rutas disponibles:', err);
        if (active) {
          setTargetMode('new');
        }
      } finally {
        if (active) setLoadingRoutes(false);
      }
    };
    fetchRoutes();
    return () => { active = false; };
  }, [isOpen, batchData, selectedGuias.length, cleanBatchBaseName]);

  const sortedDistrictEntries = useMemo(() => {
    return Object.entries(batchData.distritos || {}).sort((a, b) => b[1] - a[1]);
  }, [batchData.distritos]);

  const filteredRoutes = useMemo(() => {
    if (!routeSearch.trim()) return availableRoutes;
    const q = routeSearch.toLowerCase().trim();
    return availableRoutes.filter(r =>
      r.nombre_lote.toLowerCase().includes(q) ||
      String(r.id).includes(q) ||
      (r.zona || '').toLowerCase().includes(q) ||
      (r.sede_nombre || '').toLowerCase().includes(q)
    );
  }, [availableRoutes, routeSearch]);

  if (!isOpen) return null;

  const toggleDistrito = (dist: string) => {
    setSelectedDistritos(prev =>
      prev.includes(dist) ? prev.filter(d => d !== dist) : [...prev, dist]
    );
  };

  const handleSelectAllDistritos = () => {
    if (selectedDistritos.length === sortedDistrictEntries.length) {
      setSelectedDistritos([]);
    } else {
      setSelectedDistritos(sortedDistrictEntries.map(([d]) => d));
    }
  };

  const selectionSet = new Set(selectedGuias.map(g => g.toUpperCase()));
  const paquetesFiltrados = useSelectionOnly && selectedGuias.length > 0
    ? batchData.paquetes.filter(p => selectionSet.has(p.guia.toUpperCase()))
    : batchData.paquetes.filter(p => selectedDistritos.includes(p.distrito || 'DESCONOCIDO'));

  const uniqueClientsMap = new Map<string, typeof paquetesFiltrados>();
  paquetesFiltrados.forEach(p => {
    const key = `${p.consignado.toUpperCase().trim()}|${p.telefono || ''}`;
    const list = uniqueClientsMap.get(key) || [];
    list.push(p);
    uniqueClientsMap.set(key, list);
  });

  const clientesFiltrados = uniqueClientsMap.size;
  const avisosACrear = modoAgrupacion === 'individual' ? paquetesFiltrados.length : clientesFiltrados;
  const withValidPhone = paquetesFiltrados.filter(p => p.telefono && p.telefono.replace(/\D/g, '').length >= 9).length;
  const withoutPhone = paquetesFiltrados.length - withValidPhone;

  // Build dynamic sample preview from current filtered dataset
  const samplePreview = (() => {
    if (paquetesFiltrados.length === 0) return null;
    if (modoAgrupacion === 'agrupado_por_cliente') {
      const groupedEntries = Array.from(uniqueClientsMap.values());
      const multiOrFirst = groupedEntries.find(g => g.length > 1) || groupedEntries[0]!;
      const first = multiOrFirst[0]!;
      return {
        nombre: first.consignado,
        telefono: first.telefono || 'Sin celular',
        guias: multiOrFirst.map(p => p.guia).join(', '),
        piezas: multiOrFirst.reduce((acc, p) => acc + (p.piezas || 1), 0),
        distrito: first.distrito || 'General',
        isMulti: multiOrFirst.length > 1,
      };
    }
    const first = paquetesFiltrados[0]!;
    return {
      nombre: first.consignado,
      telefono: first.telefono || 'Sin celular',
      guias: first.guia,
      piezas: first.piezas || 1,
      distrito: first.distrito || 'General',
      isMulti: false,
    };
  })();

  const selectedRouteObj = availableRoutes.find(r => r.id === selectedRouteId) || null;
  const targetLabel = targetMode === 'existing'
    ? (selectedRouteObj ? `${selectedRouteObj.nombre_lote} (MYG-${selectedRouteObj.id})` : 'Sin ruta seleccionada')
    : (nombreRuta.trim() || 'Nueva ruta');

  const handleSubmit = async () => {
    if (targetMode === 'existing' && !selectedRouteId) {
      setError('Selecciona una ruta disponible de hoy o crea una nueva.');
      return;
    }
    if (targetMode === 'new' && !nombreRuta.trim()) {
      setError('Ingresa un nombre para la nueva ruta.');
      return;
    }
    if (!useSelectionOnly && selectedDistritos.length === 0) {
      setError('Debes seleccionar al menos un distrito.');
      return;
    }
    if (paquetesFiltrados.length === 0) {
      setError('No hay paquetes seleccionados para enviar.');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await jntService.createWhatsAppRoute({
        lote_jnt_id: batchId,
        lote_destino_id: targetMode === 'existing' ? selectedRouteId : undefined,
        nombre_lote: targetMode === 'new' ? nombreRuta.trim() : undefined,
        modo_agrupacion: modoAgrupacion,
        guias_seleccionadas: useSelectionOnly && selectedGuias.length > 0 ? selectedGuias : undefined,
        distritos_filtro: (!useSelectionOnly && selectedDistritos.length !== sortedDistrictEntries.length)
          ? selectedDistritos
          : undefined,
      });

      setSuccessResult(res);
      onSentSuccess?.(res);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || err.message || 'Error al enviar paquetes a la ruta');
    } finally {
      setLoading(false);
    }
  };

  const modalFooter = successResult ? (
    <>
      <Button variant="secondary" size="sm" onClick={onClose}>
        Cerrar
      </Button>
      <Button
        variant="primary"
        size="sm"
        icon={<Send size={14} />}
        onClick={() => {
          onClose();
          navigate(`/rutas/${successResult.lote_carga_id}`);
        }}
      >
        Abrir Ruta en Logística
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>
        Cancelar
      </Button>
      <Button
        variant="primary"
        size="sm"
        icon={<Send size={14} />}
        loading={loading}
        onClick={handleSubmit}
        disabled={loading || paquetesFiltrados.length === 0 || (targetMode === 'existing' && !selectedRouteId)}
      >
        {loading
          ? 'Enviando...'
          : targetMode === 'existing'
            ? 'Confirmar y Mandar a Ruta'
            : 'Crear Ruta y Mandar'}
      </Button>
    </>
  );

  return (
    <Modal
      open={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Mandar Paquetes a Ruta"
      description="Consola de enrutamiento J&T Express hacia el módulo de Logística."
      icon={<Send />}
      maxWidth={860}
      footer={modalFooter}
    >
      {successResult ? (
        <div className={styles.successContainer}>
          <CheckCircle2 size={46} className={styles.successIcon} />
          <h3 className={styles.successTitle}>
            {successResult.total_avisos > 0 ? 'Paquetes enrutados correctamente' : 'Sin registros nuevos por agregar'}
          </h3>
          <p className={styles.successDescription}>
            Destino: <strong>{successResult.nombre_ruta}</strong> (MYG-{successResult.lote_carga_id}).
            <br />
            Se insertaron <strong>{successResult.total_avisos}</strong> avisos de despacho
            {successResult.omitidos > 0 && ` (${successResult.omitidos} ya existían en esta ruta)`}.
          </p>
        </div>
      ) : (
        <div className={styles.dispatchConsoleGrid}>
          {/* LEFT WORKSPACE: 3 Structured Architectural Steps */}
          <div className={styles.consoleConfigPane}>
            {/* Step 01: Target Route */}
            <section className={styles.consoleSection}>
              <div className={styles.consoleSectionHead}>
                <div className={styles.stepTitleGroup}>
                  <span className={styles.stepTag}>01</span>
                  <h3>Destino en Rutas</h3>
                </div>
                {availableRoutes.length > 0 && (
                  <button
                    type="button"
                    className={styles.modeToggleLink}
                    onClick={() => setTargetMode(targetMode === 'existing' ? 'new' : 'existing')}
                    disabled={loading}
                  >
                    {targetMode === 'existing' ? (
                      <>
                        <Plus size={13} />
                        <span>Crear ruta nueva</span>
                      </>
                    ) : (
                      <>
                        <ArrowLeft size={13} />
                        <span>Elegir ruta de hoy ({availableRoutes.length})</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {targetMode === 'existing' ? (
                <div className={styles.routeListBlock}>
                  {availableRoutes.length > 4 && (
                    <div className={styles.consoleSearchRow}>
                      <Search size={13} />
                      <input
                        type="text"
                        value={routeSearch}
                        onChange={e => setRouteSearch(e.target.value)}
                        placeholder="Filtrar rutas de hoy..."
                        aria-label="Filtrar rutas disponibles"
                      />
                    </div>
                  )}

                  {loadingRoutes ? (
                    <div className={styles.consoleEmptyBox}>
                      <Loader2 size={15} className={styles.spinner} />
                      <span>Consultando rutas de hoy...</span>
                    </div>
                  ) : filteredRoutes.length === 0 ? (
                    <div className={styles.consoleEmptyBox}>
                      <span>No hay rutas activas creadas hoy.</span>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => setTargetMode('new')}
                      >
                        Crear ruta nueva
                      </button>
                    </div>
                  ) : (
                    <div className={styles.consoleRouteList} role="listbox" aria-label="Rutas disponibles">
                      {filteredRoutes.map(route => {
                        const isSelected = selectedRouteId === route.id;
                        return (
                          <button
                            key={route.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`${styles.consoleRouteRow} ${isSelected ? styles.consoleRouteRowSelected : ''}`}
                            onClick={() => setSelectedRouteId(route.id)}
                            disabled={loading}
                          >
                            <div className={styles.consoleRouteInfo}>
                              <div className={styles.consoleRouteTop}>
                                <span className={styles.routeCodePill}>MYG-{route.id}</span>
                                <strong>{route.nombre_lote}</strong>
                              </div>
                              <span className={styles.consoleRouteSub}>
                                {formatRouteDateLabel(route.fecha)} · {route.total_registros} {route.total_registros === 1 ? 'aviso actual' : 'avisos actuales'}
                                {route.sede_nombre ? ` · ${route.sede_nombre}` : ''}
                              </span>
                            </div>
                            <div className={styles.consoleRouteStatus}>
                              <span className={styles.statusTagPlain}>{route.estado}</span>
                              {isSelected && <span className={styles.selectedIndicator}><Check size={12} /></span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.newRouteInputBlock}>
                  <input
                    id="jnt-new-route-name"
                    type="text"
                    className={styles.formInput}
                    value={nombreRuta}
                    onChange={e => setNombreRuta(e.target.value)}
                    placeholder="Nombre de la nueva ruta (ej. Satipo J&T Tarde)"
                    disabled={loading}
                  />
                  <span className={styles.fieldHint}>
                    Se creará automáticamente en el módulo Rutas con fecha de hoy.
                  </span>
                </div>
              )}
            </section>

            {/* Step 02: Grouping Strategy */}
            <section className={styles.consoleSection}>
              <div className={styles.consoleSectionHead}>
                <div className={styles.stepTitleGroup}>
                  <span className={styles.stepTag}>02</span>
                  <h3>Estrategia de Notificación</h3>
                </div>
              </div>

              <div className={styles.strategyGrid}>
                <button
                  type="button"
                  className={`${styles.strategyCard} ${modoAgrupacion === 'individual' ? styles.strategyCardSelected : ''}`}
                  onClick={() => !loading && setModoAgrupacion('individual')}
                >
                  <div className={styles.strategyHead}>
                    <Package size={15} />
                    <strong>Individual</strong>
                    <span className={styles.strategyCount}>{paquetesFiltrados.length}</span>
                  </div>
                  <p>Genera 1 mensaje separado por cada número de guía.</p>
                </button>

                <button
                  type="button"
                  className={`${styles.strategyCard} ${modoAgrupacion === 'agrupado_por_cliente' ? styles.strategyCardSelected : ''}`}
                  onClick={() => !loading && setModoAgrupacion('agrupado_por_cliente')}
                >
                  <div className={styles.strategyHead}>
                    <Users size={15} />
                    <strong>Consolidado por cliente</strong>
                    <span className={styles.strategyCount}>{clientesFiltrados}</span>
                  </div>
                  <p>Agrupa varias guías del mismo consignado en 1 solo aviso.</p>
                </button>
              </div>
            </section>

            {/* Step 03: Coverage / Districts */}
            <section className={styles.consoleSection}>
              <div className={styles.consoleSectionHead}>
                <div className={styles.stepTitleGroup}>
                  <span className={styles.stepTag}>03</span>
                  <h3>{useSelectionOnly ? 'Alcance seleccionado' : 'Cobertura por Distrito'}</h3>
                </div>
                {!useSelectionOnly && (
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={handleSelectAllDistritos}
                    disabled={loading}
                  >
                    {selectedDistritos.length === sortedDistrictEntries.length ? 'Limpiar' : 'Seleccionar todos'}
                  </button>
                )}
              </div>

              {selectedGuias.length > 0 && (
                <label className={styles.selectionCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={useSelectionOnly}
                    onChange={e => setUseSelectionOnly(e.target.checked)}
                    disabled={loading}
                  />
                  <span>Incluir solo los <strong>{selectedGuias.length}</strong> paquetes marcados en la tabla</span>
                </label>
              )}

              {!useSelectionOnly && (
                <div className={styles.districtChecklistGrid}>
                  {sortedDistrictEntries.map(([dist, count]) => {
                    const checked = selectedDistritos.includes(dist);
                    const pct = Math.round((count / Math.max(batchData.totalPaquetes, 1)) * 100);
                    return (
                      <button
                        key={dist}
                        type="button"
                        className={`${styles.districtCheckRow} ${checked ? styles.districtCheckRowActive : ''}`}
                        onClick={() => !loading && toggleDistrito(dist)}
                      >
                        <span className={styles.districtCheckBox}>
                          {checked && <Check size={11} />}
                        </span>
                        <span className={styles.districtCheckName}>{dist}</span>
                        <span className={styles.districtCheckMeta}>{count} ({pct}%)</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {error && (
              <div className={styles.errorMessage}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* RIGHT PANE: High-Contrast Dark Executive Telemetry & Live Sample */}
          <aside className={styles.consolePreviewPane} aria-label="Resumen de ejecución">
            <div className={styles.previewHeader}>
              <span className={styles.previewEyebrow}>Resumen de Operación</span>
              <div className={styles.previewTargetLine}>
                <MapPin size={14} />
                <strong>{targetLabel}</strong>
              </div>
            </div>

            <div className={styles.previewHeroMetric}>
              <span>Avisos a encolar</span>
              <strong>{avisosACrear}</strong>
            </div>

            <div className={styles.previewBreakdown}>
              <div className={styles.previewStatItem}>
                <span>Paquetes</span>
                <strong>{paquetesFiltrados.length}</strong>
              </div>
              <div className={styles.previewStatItem}>
                <span>Consignados</span>
                <strong>{clientesFiltrados}</strong>
              </div>
              <div className={styles.previewStatItem}>
                <span>Con móvil</span>
                <strong>{withValidPhone}</strong>
              </div>
            </div>

            {withoutPhone > 0 && (
              <div className={styles.previewPhoneWarning}>
                <Smartphone size={14} />
                <span>{withoutPhone} guías sin celular quedarán registradas sin envío automático.</span>
              </div>
            )}

            {samplePreview && (
              <div className={styles.previewSampleBox}>
                <div className={styles.previewSampleLabel}>
                  <span>Muestra de registro en ruta</span>
                  {samplePreview.isMulti && <span className={styles.sampleMultiTag}>Consolidado</span>}
                </div>
                <div className={styles.previewSampleCard}>
                  <div className={styles.sampleRow}>
                    <small>Destinatario</small>
                    <strong>{samplePreview.nombre}</strong>
                  </div>
                  <div className={styles.sampleRow}>
                    <small>Teléfono</small>
                    <span>{samplePreview.telefono}</span>
                  </div>
                  <div className={styles.sampleRow}>
                    <small>Código(s)</small>
                    <code>{samplePreview.guias}</code>
                  </div>
                  <div className={styles.sampleRow}>
                    <small>Destino / Piezas</small>
                    <span>{samplePreview.distrito} · {samplePreview.piezas} {samplePreview.piezas === 1 ? 'pieza' : 'piezas'}</span>
                  </div>
                </div>
              </div>
            )}

            <div className={styles.previewTrustNote}>
              <ShieldCheck size={14} />
              <span>Control automático anti-duplicados al insertar en la ruta.</span>
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
};
