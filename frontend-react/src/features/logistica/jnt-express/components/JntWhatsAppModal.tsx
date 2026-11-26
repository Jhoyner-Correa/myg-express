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
  Search
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
      setError('Selecciona una ruta destino disponible o cambia a "Crear ruta nueva".');
      return;
    }
    if (targetMode === 'new' && !nombreRuta.trim()) {
      setError('Ingresa un nombre para la nueva ruta.');
      return;
    }
    if (!useSelectionOnly && selectedDistritos.length === 0) {
      setError('Debes seleccionar al menos un distrito para enviar.');
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

  return (
    <Modal
      open={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Mandar Paquetes a Ruta"
    >
      <div className={styles.modalBody}>
        {successResult ? (
          <div className={styles.successContainer}>
            <CheckCircle2 size={48} className={styles.successIcon} />
            <h3 className={styles.successTitle}>
              {successResult.total_avisos > 0 ? 'Paquetes enviados a la ruta' : 'Sin cambios nuevos'}
            </h3>
            <p className={styles.successDescription}>
              Ruta destino: <strong>{successResult.nombre_ruta}</strong> (MYG-{successResult.lote_carga_id}).
              <br />
              Se agregaron <strong>{successResult.total_avisos}</strong> avisos
              {successResult.omitidos > 0 && ` (${successResult.omitidos} omitidos por estar ya en la ruta)`}.
            </p>
            <div className={styles.successActions}>
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  navigate(`/rutas/${successResult.lote_carga_id}`);
                }}
              >
                <Send size={15} />
                Abrir Ruta en Logística
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.modalDescription}>
              Elige una ruta existente creada en el módulo <strong>Rutas</strong> o crea una nueva para despachar los avisos de WhatsApp.
            </p>

            {/* Target Route Mode Switch */}
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
                <span>Ruta existente ({availableRoutes.length})</span>
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
                  <label className={styles.formLabel}>Rutas disponibles en el módulo Rutas:</label>
                  {availableRoutes.length > 5 && (
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
                    <span>Cargando rutas disponibles...</span>
                  </div>
                ) : filteredRoutes.length === 0 ? (
                  <div className={styles.routesEmptyBox}>
                    <p>No hay rutas activas o pendientes disponibles.</p>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => setTargetMode('new')}
                    >
                      Crear ruta nueva aquí
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
                          <div className={styles.routeOptionLeft}>
                            <strong>{route.nombre_lote}</strong>
                            <span>
                              MYG-{route.id} · {route.fecha} · {route.total_registros} {route.total_registros === 1 ? 'registro' : 'registros'}
                              {route.sede_nombre ? ` · ${route.sede_nombre}` : ''}
                            </span>
                          </div>
                          <span className={styles.routeStatusTag}>{route.estado}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="jnt-new-route-name">Nombre de la nueva ruta:</label>
                <input
                  id="jnt-new-route-name"
                  type="text"
                  className={styles.formInput}
                  value={nombreRuta}
                  onChange={e => setNombreRuta(e.target.value)}
                  placeholder="Ej. J&T Express Satipo y Mazamari"
                  disabled={loading}
                />
              </div>
            )}

            {/* Grouping mode */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Modo de envío por cliente:</label>
              <div className={styles.modeCards}>
                <div
                  className={`${styles.modeCard} ${modoAgrupacion === 'individual' ? styles.modeCardActive : ''}`}
                  onClick={() => !loading && setModoAgrupacion('individual')}
                >
                  <Package size={20} className={styles.modeIcon} />
                  <div className={styles.modeContent}>
                    <strong>1 aviso por paquete</strong>
                    <span>Envía un aviso separado por cada guía ({paquetesFiltrados.length}).</span>
                  </div>
                </div>

                <div
                  className={`${styles.modeCard} ${modoAgrupacion === 'agrupado_por_cliente' ? styles.modeCardActive : ''}`}
                  onClick={() => !loading && setModoAgrupacion('agrupado_por_cliente')}
                >
                  <Users size={20} className={styles.modeIcon} />
                  <div className={styles.modeContent}>
                    <strong>Agrupar por consignado</strong>
                    <span>Consolida múltiples guías en 1 mensaje ({clientesFiltrados}).</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Scope: Either selected rows OR district chips */}
            {selectedGuias.length > 0 && (
              <div className={styles.selectionScopeBanner}>
                <label className={styles.selectionCheckboxLabel}>
                  <input
                    type="checkbox"
                    checked={useSelectionOnly}
                    onChange={e => setUseSelectionOnly(e.target.checked)}
                    disabled={loading}
                  />
                  <span>Enviar solo los <strong>{selectedGuias.length}</strong> paquetes marcados en la tabla</span>
                </label>
              </div>
            )}

            {!useSelectionOnly && (
              <div className={styles.formGroup}>
                <div className={styles.districtHeader}>
                  <label className={styles.formLabel}>Filtrar por distrito:</label>
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

            <div className={styles.dispatchSummaryBox}>
              <div className={styles.summaryItem}>
                <span>Paquetes</span>
                <strong>{paquetesFiltrados.length}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Consignados</span>
                <strong>{clientesFiltrados}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Avisos a generar</span>
                <strong className={styles.highlightText}>
                  {modoAgrupacion === 'individual' ? paquetesFiltrados.length : clientesFiltrados}
                </strong>
              </div>
            </div>

            {error && (
              <div className={styles.errorMessage}>
                <AlertCircle size={17} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={loading || paquetesFiltrados.length === 0 || (targetMode === 'existing' && !selectedRouteId)}
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className={styles.spinner} />
                    Enviando a ruta...
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    {targetMode === 'existing' ? 'Mandar a Ruta Seleccionada' : 'Crear Ruta y Mandar'}
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
