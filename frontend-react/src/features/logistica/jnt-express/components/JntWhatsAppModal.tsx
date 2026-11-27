import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MapPin,
  ChevronDown,
  ChevronUp,
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

export const JntWhatsAppModal: React.FC<JntWhatsAppModalProps> = ({
  isOpen,
  onClose,
  batchData,
  batchId,
  selectedGuias = [],
  onSentSuccess,
}) => {
  const navigate = useNavigate();

  const [availableRoutes, setAvailableRoutes] = useState<JntAvailableRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);

  const [selectedDistritos, setSelectedDistritos] = useState<string[]>(Object.keys(batchData.distritos || {}));
  const [showDistrictFilter, setShowDistrictFilter] = useState(false);
  const [useSelectionOnly, setUseSelectionOnly] = useState<boolean>(selectedGuias.length > 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<JntSendToRouteResult | null>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    isSubmittingRef.current = false;
    setError(null);
    setSuccessResult(null);
    setShowDistrictFilter(false);
    setUseSelectionOnly(selectedGuias.length > 0);
    setSelectedDistritos(Object.keys(batchData.distritos || {}));

    let active = true;
    const fetchRoutes = async () => {
      try {
        setLoadingRoutes(true);
        const routes = await jntService.listAvailableRoutes(batchId);
        if (!active) return;
        const safeRoutes = Array.isArray(routes) ? routes : [];
        setAvailableRoutes(safeRoutes);
        if (safeRoutes.length > 0) {
          const linkedRoute = batchData.lote?.lote_carga_id
            ? safeRoutes.find(r => r.id === batchData.lote?.lote_carga_id)
            : null;
          setSelectedRouteId(linkedRoute ? linkedRoute.id : safeRoutes[0]!.id);
        } else {
          setSelectedRouteId(null);
        }
      } catch (err) {
        console.warn('No se pudieron cargar las rutas disponibles:', err);
        if (active) setAvailableRoutes([]);
      } finally {
        if (active) setLoadingRoutes(false);
      }
    };
    fetchRoutes();
    return () => { active = false; };
    // Only initialize and fetch routes when opening the modal or switching batchId;
    // do not reset successResult when onSentSuccess updates batchData.lote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, batchId]);

  const sortedDistrictEntries = useMemo(() => {
    return Object.entries(batchData.distritos || {}).sort((a, b) => b[1] - a[1]);
  }, [batchData.distritos]);

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

  const selectedRouteObj = availableRoutes.find(r => r.id === selectedRouteId) || null;
  const targetLabel = selectedRouteObj ? selectedRouteObj.nombre_lote : 'la ruta seleccionada';
  const allDistrictsSelected = selectedDistritos.length === sortedDistrictEntries.length;

  const selectedRouteCodes = new Set(
    (selectedRouteObj?.guias_existentes || []).map(g => g.trim().toUpperCase())
  );
  const alreadySentCount = paquetesFiltrados.filter(p =>
    selectedRouteCodes.has(p.guia.trim().toUpperCase())
  ).length;
  const pendingCount = Math.max(0, paquetesFiltrados.length - alreadySentCount);
  const allAlreadyInRoute = paquetesFiltrados.length > 0 && pendingCount === 0 && Boolean(selectedRouteObj);

  const handleSubmit = async () => {
    if (isSubmittingRef.current || loading) return;
    if (!selectedRouteId) {
      setError('Selecciona una ruta disponible de hoy para enviar los paquetes.');
      return;
    }
    if (!useSelectionOnly && selectedDistritos.length === 0) {
      setError('Selecciona al menos un distrito.');
      return;
    }
    if (paquetesFiltrados.length === 0) {
      setError('No hay paquetes para enviar.');
      return;
    }
    if (allAlreadyInRoute) {
      return;
    }

    isSubmittingRef.current = true;
    try {
      setLoading(true);
      setError(null);

      // Always 1 message per package (individual)
      const res = await jntService.createWhatsAppRoute({
        lote_jnt_id: batchId,
        lote_destino_id: selectedRouteId,
        modo_agrupacion: 'individual',
        guias_seleccionadas: useSelectionOnly && selectedGuias.length > 0 ? selectedGuias : undefined,
        distritos_filtro: (!useSelectionOnly && !allDistrictsSelected)
          ? selectedDistritos
          : undefined,
      });

      const sentCodes = paquetesFiltrados.map(p => p.guia.trim().toUpperCase());
      setAvailableRoutes(prev =>
        prev.map(r => {
          if (r.id !== res.lote_carga_id) return r;
          const merged = Array.from(new Set([...(r.guias_existentes || []), ...sentCodes]));
          return {
            ...r,
            total_registros: Number(r.total_registros || 0) + Number(res.total_avisos || 0),
            guias_existentes: merged,
          };
        })
      );

      setSuccessResult(res);
      onSentSuccess?.(res);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || err.message || 'No se pudo enviar a la ruta');
    } finally {
      isSubmittingRef.current = false;
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
        Ir a la Ruta
      </Button>
    </>
  ) : allAlreadyInRoute && selectedRouteObj ? (
    <>
      <Button variant="secondary" size="sm" onClick={onClose}>
        Cerrar
      </Button>
      <Button
        variant="primary"
        size="sm"
        icon={<CheckCircle2 size={14} />}
        onClick={() => {
          onClose();
          navigate(`/rutas/${selectedRouteObj.id}`);
        }}
      >
        Ir a la Ruta
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
        disabled={loading || pendingCount === 0 || !selectedRouteId}
      >
        {loading ? 'Enviando a ruta...' : `Confirmar y mandar (${pendingCount})`}
      </Button>
    </>
  );

  return (
    <Modal
      open={isOpen}
      onClose={loading ? () => {} : onClose}
      title={successResult ? 'Envío confirmado a Ruta' : 'Mandar Paquetes a Ruta'}
      description={
        successResult
          ? 'Los paquetes ya quedaron registrados y protegidos contra duplicados.'
          : 'Elige la ruta de hoy donde se cargarán estos paquetes.'
      }
      icon={successResult ? <CheckCircle2 /> : <Send />}
      maxWidth={540}
      footer={modalFooter}
    >
      {successResult ? (
        <div className={styles.successContainer}>
          <div className={styles.successIconBadge}>
            <CheckCircle2 size={32} className={styles.successIcon} />
          </div>
          <h3 className={styles.successTitle}>
            {successResult.total_avisos > 0
              ? '¡Confirmado! Paquetes mandados a la ruta'
              : 'Confirmado: ya estaban registrados en la ruta'}
          </h3>
          <p className={styles.successDescription}>
            {successResult.total_avisos > 0 ? (
              <>
                Se agregaron <strong>{successResult.total_avisos}</strong> avisos individuales a{' '}
                <strong>{successResult.nombre_ruta}</strong>.
              </>
            ) : (
              <>
                No se generó ningún duplicado porque las guías ya existían en{' '}
                <strong>{successResult.nombre_ruta}</strong>.
              </>
            )}
          </p>
          <div className={styles.successDetailsCard}>
            <div>
              <span>Ruta destino</span>
              <strong>{successResult.nombre_ruta} (MYG-{successResult.lote_carga_id})</strong>
            </div>
            <div>
              <span>Avisos nuevos</span>
              <strong>{successResult.total_avisos}</strong>
            </div>
            {successResult.omitidos > 0 && (
              <div>
                <span>Duplicados omitidos</span>
                <strong>{successResult.omitidos}</strong>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.calmModalStack}>
          {/* 1. Today's Available Routes */}
          <div className={styles.calmSection}>
            <label className={styles.calmLabel}>Rutas disponibles de hoy</label>

            {loadingRoutes ? (
              <div className={styles.calmBoxPlaceholder}>
                <Loader2 size={15} className={styles.spinner} />
                <span>Cargando rutas de hoy...</span>
              </div>
            ) : availableRoutes.length === 0 ? (
              <div className={styles.calmBoxPlaceholder} style={{ flexDirection: 'column', textAlign: 'center' }}>
                <span>No hay rutas creadas hoy todavía.</span>
                <button
                  type="button"
                  className={styles.calmTextBtn}
                  onClick={() => {
                    onClose();
                    navigate('/logistica');
                  }}
                >
                  Crear una ruta en Rutas
                </button>
              </div>
            ) : (
              <div className={styles.calmRouteList} role="listbox" aria-label="Rutas de hoy">
                {availableRoutes.map(route => {
                  const isSelected = selectedRouteId === route.id;
                  const routeCodeSet = new Set((route.guias_existentes || []).map(g => g.trim().toUpperCase()));
                  const matchedInRoute = paquetesFiltrados.filter(p =>
                    routeCodeSet.has(p.guia.trim().toUpperCase())
                  ).length;
                  const fullySentToThisRoute = paquetesFiltrados.length > 0 && matchedInRoute === paquetesFiltrados.length;

                  return (
                    <button
                      key={route.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`${styles.calmRouteOption} ${isSelected ? styles.calmRouteSelected : ''}`}
                      onClick={() => setSelectedRouteId(route.id)}
                      disabled={loading}
                    >
                      <span className={styles.calmRadioDot} aria-hidden="true">
                        <i />
                      </span>
                      <div className={styles.calmRouteText}>
                        <strong>{route.nombre_lote}</strong>
                        <span>
                          MYG-{route.id} · {route.total_registros} {route.total_registros === 1 ? 'registro actual' : 'registros actuales'}
                        </span>
                      </div>
                      {fullySentToThisRoute ? (
                        <span className={styles.calmRouteSentBadge}>Ya enviados</span>
                      ) : matchedInRoute > 0 ? (
                        <span className={styles.calmRoutePartialBadge}>{matchedInRoute} ya en ruta</span>
                      ) : (
                        <span className={styles.calmRouteStatus}>{route.estado}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Selection OR Optional District Filter */}
          {selectedGuias.length > 0 && (
            <label className={styles.calmCheckboxRow}>
              <input
                type="checkbox"
                checked={useSelectionOnly}
                onChange={e => setUseSelectionOnly(e.target.checked)}
                disabled={loading}
              />
              <span>Enviar solo los <strong>{selectedGuias.length}</strong> paquetes marcados en la tabla</span>
            </label>
          )}

          {!useSelectionOnly && sortedDistrictEntries.length > 1 && (
            <div className={styles.calmSection}>
              <div className={styles.calmDistrictToggleBar}>
                <span>
                  Distritos:{' '}
                  <strong>
                    {allDistrictsSelected
                      ? `Todos (${sortedDistrictEntries.length})`
                      : `${selectedDistritos.length} de ${sortedDistrictEntries.length} seleccionados`}
                  </strong>
                </span>
                <button
                  type="button"
                  className={styles.calmTextBtn}
                  onClick={() => setShowDistrictFilter(v => !v)}
                >
                  <span>{showDistrictFilter ? 'Ocultar filtro' : 'Filtrar distritos'}</span>
                  {showDistrictFilter ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              </div>

              {showDistrictFilter && (
                <div className={styles.calmDistrictPanel}>
                  <div className={styles.calmDistrictPanelTop}>
                    <span>Marca los distritos a incluir:</span>
                    <button type="button" className={styles.calmTextBtn} onClick={handleSelectAllDistritos}>
                      {allDistrictsSelected ? 'Quitar todos' : 'Marcar todos'}
                    </button>
                  </div>
                  <div className={styles.calmDistrictPills}>
                    {sortedDistrictEntries.map(([dist, count]) => {
                      const active = selectedDistritos.includes(dist);
                      return (
                        <button
                          key={dist}
                          type="button"
                          className={`${styles.calmDistrictPill} ${active ? styles.calmDistrictPillActive : ''}`}
                          onClick={() => !loading && toggleDistrito(dist)}
                        >
                          <span>{dist}</span>
                          <small>{count}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Structured confirmation / anti-duplication summary */}
          {allAlreadyInRoute ? (
            <div className={styles.calmSummaryDone}>
              <CheckCircle2 size={17} />
              <div>
                <strong>
                  Confirmado: estos {alreadySentCount} paquetes ya fueron mandados a {targetLabel}.
                </strong>
                <span>
                  No se enviarán de nuevo para evitar duplicados. Puedes abrir la ruta directamente.
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.calmSummaryCard}>
              <div className={styles.calmSummaryTop}>
                <MapPin size={15} />
                <span>
                  Se enviarán <strong>{pendingCount}</strong> mensajes individuales (1 por paquete) a{' '}
                  <strong>{targetLabel}</strong>.
                </span>
              </div>
              <div className={styles.calmSummaryMeta}>
                <ShieldCheck size={13} />
                <span>
                  {alreadySentCount > 0
                    ? `${alreadySentCount} ya están en esta ruta y se omitirán automáticamente.`
                    : 'Control anti-duplicados activo: un clic registra el envío sin duplicarlo.'}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className={styles.errorMessage}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
