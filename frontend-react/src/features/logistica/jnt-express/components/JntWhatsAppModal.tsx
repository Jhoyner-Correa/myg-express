import React, { useEffect, useMemo, useState } from 'react';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Package,
  MapPin,
  PlusCircle,
  Search,
  Check
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

  const distritosList = Object.keys(batchData.distritos || {});

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
    if (selectedDistritos.length === distritosList.length) {
      setSelectedDistritos([]);
    } else {
      setSelectedDistritos(distritosList);
    }
  };

  const selectionSet = new Set(selectedGuias.map(g => g.toUpperCase()));
  const paquetesFiltrados = useSelectionOnly && selectedGuias.length > 0
    ? batchData.paquetes.filter(p => selectionSet.has(p.guia.toUpperCase()))
    : batchData.paquetes.filter(p => selectedDistritos.includes(p.distrito || 'DESCONOCIDO'));

  const clientesFiltrados = new Set(
    paquetesFiltrados.map(p => `${p.consignado.toUpperCase()}|${p.telefono}`)
  ).size;

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
        distritos_filtro: (!useSelectionOnly && selectedDistritos.length !== distritosList.length)
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
            ? 'Mandar a Ruta'
            : 'Crear Ruta y Mandar'}
      </Button>
    </>
  );

  return (
    <Modal
      open={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Mandar Paquetes a Ruta"
      description="Asigna estos paquetes a una ruta de hoy o crea una nueva para despacho."
      icon={<Send />}
      maxWidth={600}
      footer={modalFooter}
    >
      <div className={styles.modalBody}>
        {successResult ? (
          <div className={styles.successContainer}>
            <CheckCircle2 size={44} className={styles.successIcon} />
            <h3 className={styles.successTitle}>
              {successResult.total_avisos > 0 ? 'Paquetes enviados a la ruta' : 'Sin registros nuevos'}
            </h3>
            <p className={styles.successDescription}>
              Ruta destino: <strong>{successResult.nombre_ruta}</strong> (MYG-{successResult.lote_carga_id}).
              <br />
              Se agregaron <strong>{successResult.total_avisos}</strong> avisos
              {successResult.omitidos > 0 && ` (${successResult.omitidos} omitidos por estar ya registrados)`}.
            </p>
          </div>
        ) : (
          <>
            {/* Segmented Mode Switch */}
            <div className={styles.routeModeSwitch} role="tablist" aria-label="Destino de ruta">
              <button
                type="button"
                role="tab"
                aria-selected={targetMode === 'existing'}
                className={targetMode === 'existing' ? styles.routeModeActive : ''}
                onClick={() => setTargetMode('existing')}
                disabled={loading}
              >
                <MapPin size={14} />
                <span>Ruta de hoy ({availableRoutes.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={targetMode === 'new'}
                className={targetMode === 'new' ? styles.routeModeActive : ''}
                onClick={() => setTargetMode('new')}
                disabled={loading}
              >
                <PlusCircle size={14} />
                <span>Crear ruta nueva</span>
              </button>
            </div>

            {targetMode === 'existing' ? (
              <div className={styles.formGroup}>
                <div className={styles.districtHeader}>
                  <label className={styles.formLabel}>Rutas disponibles de hoy</label>
                  {availableRoutes.length > 4 && (
                    <div className={styles.routeMiniSearch}>
                      <Search size={12} />
                      <input
                        type="text"
                        value={routeSearch}
                        onChange={e => setRouteSearch(e.target.value)}
                        placeholder="Filtrar ruta..."
                        aria-label="Filtrar rutas disponibles"
                      />
                    </div>
                  )}
                </div>

                {loadingRoutes ? (
                  <div className={styles.routesLoadingBox}>
                    <Loader2 size={16} className={styles.spinner} />
                    <span>Consultando rutas de hoy...</span>
                  </div>
                ) : filteredRoutes.length === 0 ? (
                  <div className={styles.routesEmptyBox}>
                    <p>No hay rutas creadas para hoy todavía.</p>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => setTargetMode('new')}
                    >
                      Crear una ruta nueva aquí
                    </button>
                  </div>
                ) : (
                  <div className={styles.routePickerList} role="listbox" aria-label="Rutas disponibles">
                    {filteredRoutes.map(route => {
                      const isSelected = selectedRouteId === route.id;
                      return (
                        <button
                          key={route.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`${styles.routeOptionCard} ${isSelected ? styles.routeOptionSelected : ''}`}
                          onClick={() => setSelectedRouteId(route.id)}
                          disabled={loading}
                        >
                          <div className={styles.routeOptionIcon}>
                            <MapPin size={15} />
                          </div>
                          <div className={styles.routeOptionLeft}>
                            <strong>{route.nombre_lote}</strong>
                            <span>
                              MYG-{route.id} · {formatRouteDateLabel(route.fecha)} · {route.total_registros} {route.total_registros === 1 ? 'registro' : 'registros'}
                              {route.sede_nombre ? ` · ${route.sede_nombre}` : ''}
                            </span>
                          </div>
                          <div className={styles.routeOptionRight}>
                            <span className={styles.routeStatusTag}>
                              <i />
                              {route.estado}
                            </span>
                            {isSelected && <Check size={15} className={styles.routeCheckIcon} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="jnt-new-route-name">Nombre de la nueva ruta</label>
                <input
                  id="jnt-new-route-name"
                  type="text"
                  className={styles.formInput}
                  value={nombreRuta}
                  onChange={e => setNombreRuta(e.target.value)}
                  placeholder="Ej. J&T Express Satipo"
                  disabled={loading}
                />
              </div>
            )}

            {/* Grouping mode */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Modo de agrupación</label>
              <div className={styles.modeCards}>
                <div
                  className={`${styles.modeCard} ${modoAgrupacion === 'individual' ? styles.modeCardActive : ''}`}
                  onClick={() => !loading && setModoAgrupacion('individual')}
                >
                  <Package size={18} className={styles.modeIcon} />
                  <div className={styles.modeContent}>
                    <strong>1 aviso por paquete</strong>
                    <span>Individual ({paquetesFiltrados.length} avisos)</span>
                  </div>
                </div>

                <div
                  className={`${styles.modeCard} ${modoAgrupacion === 'agrupado_por_cliente' ? styles.modeCardActive : ''}`}
                  onClick={() => !loading && setModoAgrupacion('agrupado_por_cliente')}
                >
                  <Users size={18} className={styles.modeIcon} />
                  <div className={styles.modeContent}>
                    <strong>Agrupar por consignado</strong>
                    <span>Consolidado ({clientesFiltrados} avisos)</span>
                  </div>
                </div>
              </div>
            </div>

            {selectedGuias.length > 0 && (
              <div className={styles.selectionScopeBanner}>
                <label className={styles.selectionCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={useSelectionOnly}
                    onChange={e => setUseSelectionOnly(e.target.checked)}
                    disabled={loading}
                  />
                  <span>Enviar únicamente los <strong>{selectedGuias.length}</strong> paquetes marcados en la tabla</span>
                </label>
              </div>
            )}

            {!useSelectionOnly && (
              <div className={styles.formGroup}>
                <div className={styles.districtHeader}>
                  <label className={styles.formLabel}>Distritos a incluir</label>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={handleSelectAllDistritos}
                    disabled={loading}
                  >
                    {selectedDistritos.length === distritosList.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                </div>

                <div className={styles.districtChips}>
                  {distritosList.map(dist => {
                    const count = batchData.distritos[dist];
                    const selected = selectedDistritos.includes(dist);
                    return (
                      <button
                        key={dist}
                        type="button"
                        className={`${styles.districtChip} ${selected ? styles.districtChipActive : ''}`}
                        onClick={() => !loading && toggleDistrito(dist)}
                      >
                        <span>{dist}</span>
                        <span className={styles.chipCount}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Clean inline summary strip */}
            <div className={styles.dispatchSummaryInline}>
              <span>Paquetes: <strong>{paquetesFiltrados.length}</strong></span>
              <span>·</span>
              <span>Consignados: <strong>{clientesFiltrados}</strong></span>
              <span>·</span>
              <span>
                Avisos a generar:{' '}
                <strong className={styles.highlightText}>
                  {modoAgrupacion === 'individual' ? paquetesFiltrados.length : clientesFiltrados}
                </strong>
              </span>
            </div>

            {error && (
              <div className={styles.errorMessage}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
