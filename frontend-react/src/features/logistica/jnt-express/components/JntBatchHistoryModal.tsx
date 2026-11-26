import React, { useEffect, useState } from 'react';
import { History, Eye, Trash2, ExternalLink, Calendar, Package, FileText, Loader2, Pencil, Check, X } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal/Modal';
import { Button } from '../../../../components/ui/Button/Button';
import { showConfirm, showToast } from '../../../../core/utils/toast';
import { jntService } from '../jnt.service';
import type { JntBatchHeader } from '../types';
import styles from '../JntExpress.module.css';

interface JntBatchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBatch: (id: number) => void;
  onBatchRenamed?: (id: number, newName: string) => void;
}

export const JntBatchHistoryModal: React.FC<JntBatchHistoryModalProps> = ({
  isOpen,
  onClose,
  onSelectBatch,
  onBatchRenamed,
}) => {
  const [batches, setBatches] = useState<JntBatchHeader[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingRename, setSavingRename] = useState(false);

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

  const startRename = (batch: JntBatchHeader, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(batch.id);
    setEditingName(batch.nombre_archivo);
  };

  const cancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveRename = async (id: number, e?: React.MouseEvent | React.FormEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const trimmed = editingName.trim();
    if (!trimmed) {
      showToast('Ingresa un nombre válido', 'warning');
      return;
    }
    try {
      setSavingRename(true);
      const updated = await jntService.renameBatch(id, trimmed);
      setBatches(prev => prev.map(b => (b.id === id ? { ...b, nombre_archivo: updated.nombre_archivo } : b)));
      onBatchRenamed?.(id, updated.nombre_archivo);
      setEditingId(null);
      setEditingName('');
      showToast('Nombre actualizado', 'success');
    } catch (err: unknown) {
      console.error(err);
      showToast('No se pudo renombrar el manifiesto', 'error');
    } finally {
      setSavingRename(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = await showConfirm({
      title: 'Eliminar lote de J&T Express',
      message: '¿Estás seguro de eliminar permanentemente este manifiesto importado y todas sus guías?',
      confirmText: 'Eliminar lote',
      type: 'danger',
    });
    if (!confirmed) return;
    try {
      await jntService.deleteBatch(id);
      setBatches(prev => prev.filter(b => b.id !== id));
      showToast('Lote eliminado del historial', 'success');
    } catch (err: unknown) {
      console.error(err);
      showToast('Error al eliminar lote', 'error');
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
            {batches.map(batch => {
              const isEditing = editingId === batch.id;
              return (
              <div
                key={batch.id}
                className={styles.historyCard}
                onClick={() => {
                  if (isEditing) return;
                  onSelectBatch(batch.id);
                  onClose();
                }}
              >
                <div className={styles.historyCardHeader}>
                  <div className={styles.historyCardTitle} style={{ flex: 1 }}>
                    <FileText size={18} className={styles.historyFileIcon} />
                    {isEditing ? (
                      <form
                        className={styles.renameInlineBox}
                        onSubmit={e => handleSaveRename(batch.id, e)}
                        onClick={e => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          className={styles.formInput}
                          value={editingName}
                          onChange={e => setEditingName(e.target.value)}
                          maxLength={180}
                          autoFocus
                          disabled={savingRename}
                        />
                        <button
                          type="submit"
                          className={styles.inlineIconBtn}
                          disabled={savingRename}
                          title="Guardar nombre"
                        >
                          <Check size={14} className={styles.iconOk} />
                        </button>
                        <button
                          type="button"
                          className={styles.inlineIconBtn}
                          onClick={cancelRename}
                          disabled={savingRename}
                          title="Cancelar"
                        >
                          <X size={14} />
                        </button>
                      </form>
                    ) : (
                      <span className={styles.historyFileName}>{batch.nombre_archivo}</span>
                    )}
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
                    onClick={(e) => startRename(batch, e)}
                    title="Renombrar manifiesto"
                  >
                    <Pencil size={14} />
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
              );
            })}
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
