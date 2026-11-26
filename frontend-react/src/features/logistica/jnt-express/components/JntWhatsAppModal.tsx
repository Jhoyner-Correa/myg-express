import React, { useState } from 'react';
import { Send, CheckCircle2, MessageSquare, AlertCircle, Loader2, Users, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../../components/ui/Modal/Modal';
import { Button } from '../../../../components/ui/Button/Button';
import { jntService } from '../jnt.service';
import type { JntBatchDetailData } from '../types';
import styles from '../JntExpress.module.css';

interface JntWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  batchData: JntBatchDetailData;
  batchId: number;
}

export const JntWhatsAppModal: React.FC<JntWhatsAppModalProps> = ({
  isOpen,
  onClose,
  batchData,
  batchId,
}) => {
  const navigate = useNavigate();
  const [nombreRuta, setNombreRuta] = useState(`J&T Express ${new Date().toLocaleDateString('es-PE').replace(/\//g, '-')}`);
  const [modoAgrupacion, setModoAgrupacion] = useState<'individual' | 'agrupado_por_cliente'>('individual');
  const [selectedDistritos, setSelectedDistritos] = useState<string[]>(Object.keys(batchData.distritos || {}));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{ lote_carga_id: number; total_avisos: number } | null>(null);

  if (!isOpen) return null;

  const distritosList = Object.keys(batchData.distritos || {});

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

  // Calculate package count for selected districts
  const paquetesFiltrados = batchData.paquetes.filter(p =>
    selectedDistritos.includes(p.distrito || 'DESCONOCIDO')
  );

  // Calculate unique clients for selected districts
  const clientesFiltrados = new Set(
    paquetesFiltrados.map(p => `${p.consignado.toUpperCase()}|${p.telefono}`)
  ).size;

  const handleCreateRoute = async () => {
    if (selectedDistritos.length === 0) {
      setError('Debes seleccionar al menos un distrito para enviar.');
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const res = await jntService.createWhatsAppRoute({
        lote_jnt_id: batchId,
        nombre_lote: nombreRuta.trim(),
        modo_agrupacion: modoAgrupacion,
        distritos_filtro: selectedDistritos.length === distritosList.length ? undefined : selectedDistritos
      });

      setSuccessResult(res);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.message || err.message || 'Error al crear la ruta de WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={loading ? () => {} : onClose}
      title="Crear Ruta y Despachar por WhatsApp"
    >
      <div className={styles.modalBody}>
        {successResult ? (
          <div className={styles.successContainer}>
            <CheckCircle2 size={54} className={styles.successIcon} />
            <h3 className={styles.successTitle}>¡Ruta creada exitosamente!</h3>
            <p className={styles.successDescription}>
              Se han generado <strong>{successResult.total_avisos}</strong> avisos de WhatsApp listos en la bandeja de logística.
            </p>
            <div className={styles.successActions}>
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  navigate(`/rutas/${successResult.lote_carga_id}`);
                }}
              >
                <Send size={16} />
                Ir a la Ruta para Despachar WhatsApp
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.modalDescription}>
              Configura la ruta de mensajería para notificar a los consignados extraídos del PDF de J&T Express.
            </p>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Nombre de la Ruta:</label>
              <input
                type="text"
                className={styles.formInput}
                value={nombreRuta}
                onChange={e => setNombreRuta(e.target.value)}
                placeholder="Ej. J&T Express Satipo y Mazamari"
                disabled={loading}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Modo de Envío de Mensajes:</label>
              <div className={styles.modeCards}>
                <div
                  className={`${styles.modeCard} ${modoAgrupacion === 'individual' ? styles.modeCardActive : ''}`}
                  onClick={() => !loading && setModoAgrupacion('individual')}
                >
                  <Package size={22} className={styles.modeIcon} />
                  <div className={styles.modeContent}>
                    <strong>1 Mensaje por Paquete</strong>
                    <span>Envía un mensaje individual por cada guía ({paquetesFiltrados.length} mensajes estimados).</span>
                  </div>
                </div>

                <div
                  className={`${styles.modeCard} ${modoAgrupacion === 'agrupado_por_cliente' ? styles.modeCardActive : ''}`}
                  onClick={() => !loading && setModoAgrupacion('agrupado_por_cliente')}
                >
                  <Users size={22} className={styles.modeIcon} />
                  <div className={styles.modeContent}>
                    <strong>Agrupar por Consignado</strong>
                    <span>Si un cliente tiene 2 o más paquetes, los junta en 1 solo mensaje ({clientesFiltrados} mensajes estimados).</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.formGroup}>
              <div className={styles.districtHeader}>
                <label className={styles.formLabel}>Filtrar por Distrito de Entrega:</label>
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

            <div className={styles.dispatchSummaryBox}>
              <div className={styles.summaryItem}>
                <span>Paquetes seleccionados:</span>
                <strong>{paquetesFiltrados.length}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Consignados únicos:</span>
                <strong>{clientesFiltrados}</strong>
              </div>
              <div className={styles.summaryItem}>
                <span>Total de avisos a crear:</span>
                <strong className={styles.highlightText}>
                  {modoAgrupacion === 'individual' ? paquetesFiltrados.length : clientesFiltrados}
                </strong>
              </div>
            </div>

            {error && (
              <div className={styles.errorMessage}>
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.modalActions}>
              <Button variant="ghost" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateRoute}
                disabled={loading || selectedDistritos.length === 0}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className={styles.spinner} />
                    Creando Ruta...
                  </>
                ) : (
                  <>
                    <MessageSquare size={16} />
                    Crear Ruta y Preparar Avisos
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
