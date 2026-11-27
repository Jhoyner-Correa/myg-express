import React, { useEffect, useMemo, useState } from 'react';
import {
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MapPin,
  ChevronDown,
  ChevronUp
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

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessResult(null);
    setShowDistrictFilter(false);
    setUseSelectionOnly(selectedGuias.length > 0);
    setSelectedDistritos(Object.keys(batchData.distritos || {}));

    let active = true;
    const fetchRoutes = async () => {
      try {
        setLoadingRoutes(true);
        const routes = await jntService.listAvailableRoutes();
        if (!active) return;
        setAvailableRoutes(routes);
        if (routes.length > 0) {
          const linkedRoute = batchData.lote?.lote_carga_id
            ? routes.find(r => r.id === batchData.lote?.lote_carga_id)
            : null;
          setSelectedRouteId(linkedRoute ? linkedRoute.id : routes[0]!.id);
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
  }, [isOpen, batchData, selectedGuias.length]);

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

  const handleSubmit = async () => {
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

      setSuccessResult(res);
      onSentSuccess?.(res);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || err.message || 'No se pudo enviar a la ruta');
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
        disabled={loading || paquetesFiltrados.length === 0 || !selectedRouteId}
      >
        {loading ? 'Enviando...' : 'Mandar a Ruta'}
      </Button>
    </>
  );

  return (
    <Modal
      open={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Mandar Paquetes a Ruta"
      description="Elige la ruta de hoy donde se cargarán estos paquetes."
      icon={<Send />}
      maxWidth={540}
      footer={modalFooter}
    >
      {successResult ? (
        <div className={styles.successContainer}>
          <CheckCircle2 size={44} className={styles.successIcon} />
          <h3 className={styles.successTitle}>
            {successResult.total_avisos > 0 ? 'Paquetes enviados a la ruta' : 'Ya estaban en la ruta'}
          </h3>
          <p className={styles.successDescription}>
            Se agregaron <strong>{successResult.total_avisos}</strong> avisos individuales a <strong>{successResult.nombre_ruta}</strong>.
            {successResult.omitidos > 0 && ` (${successResult.omitidos} repetidos omitidos).`}
          </p>
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
                      <span className={styles.calmRouteStatus}>{route.estado}</span>
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

          {/* Calm summary */}
          <div className={styles.calmSummaryNote}>
            <MapPin size={14} />
            <span>
              Se enviarán <strong>{paquetesFiltrados.length}</strong> mensajes individuales (1 por paquete) a{' '}
              <strong>{targetLabel}</strong>.
            </span>
          </div>

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
