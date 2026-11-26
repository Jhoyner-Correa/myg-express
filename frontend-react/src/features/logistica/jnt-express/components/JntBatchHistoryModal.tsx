import React, { useEffect, useState } from 'react';
import { History, Eye, Trash2, ExternalLink, Calendar, Package, FileText, Loader2 } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal/Modal';
import { Button } from '../../../../components/ui/Button/Button';
import { jntService } from '../jnt.service';
import type { JntBatchHeader } from '../types';
import styles from '../JntExpress.module.css';

interface JntBatchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBatch: (id: number) => void;
}

export const JntBatchHistoryModal: React.FC<JntBatchHistoryModalProps> = ({
  isOpen,
  onClose,
  onSelectBatch,
}) => {
  const [batches, setBatches] = useState<JntBatchHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadBatches();
    }
  }, [isOpen]);

  const loadBatches = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await jntService.listBatches();
      setBatches(data);
    } catch (err: any) {
      console.error(err);
      setError('No se pudo cargar el historial de importaciones.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('¿Estás seguro de eliminar este lote importado de J&T Express?')) return;
    try {
      await jntService.deleteBatch(id);
      setBatches(prev => prev.filter(b => b.id !== id));
    } catch (err: any) {
      console.error(err);
      alert('Error al eliminar lote');
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Historial de Importaciones J&T Express"
    >
      <div className={styles.modalBody}>
        {loading && (
          <div className={styles.loadingContainer}>
            <Loader2 className={styles.spinner} size={28} />
            <p>Cargando importaciones previas...</p>
          </div>
        )}

        {error && <div className={styles.errorMessage}>{error}</div>}

        {!loading && batches.length === 0 && (
          <div className={styles.emptyHistory}>
            <History size={48} className={styles.emptyIcon} />
            <p>No hay importaciones registradas todavía.</p>
            <span>Sube un archivo PDF de guías para empezar a analizar.</span>
          </div>
        )}

        {!loading && batches.length > 0 && (
          <div className={styles.historyList}>
            {batches.map(batch => (
              <div
                key={batch.id}
                className={styles.historyCard}
                onClick={() => {
                  onSelectBatch(batch.id);
                  onClose();
                }}
              >
                <div className={styles.historyCardHeader}>
                  <div className={styles.historyCardTitle}>
                    <FileText size={18} className={styles.historyFileIcon} />
                    <span className={styles.historyFileName}>{batch.nombre_archivo}</span>
                  </div>
                  <span className={styles.historyDate}>
                    <Calendar size={14} />
                    {new Date(batch.created_at).toLocaleDateString('es-PE', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>

                <div className={styles.historyCardMeta}>
                  <div className={styles.metaItem}>
                    <Package size={14} />
                    <strong>{batch.total_paquetes}</strong> paquetes ({batch.total_paginas} págs)
                  </div>
                  <div className={styles.metaItem}>
                    <strong>{batch.total_consignados}</strong> consignados
                  </div>
                  {batch.ruta_whatsapp_nombre && (
                    <div className={styles.metaBadge}>
                      <ExternalLink size={12} />
                      Ruta WhatsApp: {batch.ruta_whatsapp_nombre}
                    </div>
                  )}
                </div>

                <div className={styles.historyCardActions}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBatch(batch.id);
                      onClose();
                    }}
                  >
                    <Eye size={14} />
                    Ver Detalle
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleDelete(batch.id, e)}
                    title="Eliminar importación"
                  >
                    <Trash2 size={14} className={styles.deleteIcon} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
};
