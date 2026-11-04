import React, { useState } from 'react';
import type { UrbanoGuidePhotosResult } from './types';
import { urbanoPhotosService } from './urbanoPhotos.service';
import styles from './UrbanoGuidePhotos.module.css';

interface AssignRouteModalProps {
  guide: UrbanoGuidePhotosResult;
  siteId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedManIdDet: string, routeId?: string) => void;
}

export const AssignRouteModal: React.FC<AssignRouteModalProps> = ({
  guide,
  siteId,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'ROUTE' | 'MANUAL'>('ROUTE');
  const [routeId, setRouteId] = useState(guide.route_id || '');
  const [manualManIdDet, setManualManIdDet] = useState(guide.man_id_det || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (mode === 'ROUTE') {
        const cleanRoute = routeId.trim();
        if (!cleanRoute) {
          setError('Ingresa el número de ruta de manifiesto (vp_rou_id).');
          setIsLoading(false);
          return;
        }

        const res = await urbanoPhotosService.resolverRuta(siteId, cleanRoute);
        setSuccessMsg(res.message);

        // Volvemos a consultar la guía o intentamos obtener el man_id_det asociado
        setTimeout(() => {
          onSuccess('', cleanRoute);
          onClose();
        }, 1200);
      } else {
        const cleanManId = manualManIdDet.trim();
        if (!cleanManId) {
          setError('Ingresa el identificador man_id_det numérico.');
          setIsLoading(false);
          return;
        }

        const msg = await urbanoPhotosService.asociarManIdDet(
          siteId,
          guide.guia,
          cleanManId,
          routeId.trim() || undefined
        );
        setSuccessMsg(msg);

        setTimeout(() => {
          onSuccess(cleanManId, routeId.trim() || undefined);
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setError(err?.message || 'Error al procesar la asignación.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.confirmModalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.assignModalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.assignModalHeader}>
          <h3>Resolver / Asignar Identificador de Ruta</h3>
          <button className={styles.closeModalBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.assignGuideTarget}>
          <span>Guía objetivo:</span>
          <strong>{guide.guia}</strong>
          {guide.destinatario && <span>• {guide.destinatario}</span>}
        </div>

        <div className={styles.assignModeTabs}>
          <button
            type="button"
            className={mode === 'ROUTE' ? styles.activeTabBtn : styles.tabBtn}
            onClick={() => setMode('ROUTE')}
          >
            1. Por Ruta de Manifiesto (Automático)
          </button>
          <button
            type="button"
            className={mode === 'MANUAL' ? styles.activeTabBtn : styles.tabBtn}
            onClick={() => setMode('MANUAL')}
          >
            2. Ingreso Directo de man_id_det
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.assignForm}>
          {mode === 'ROUTE' ? (
            <div className={styles.formField}>
              <label htmlFor="route_id_input">
                Número de Ruta / Manifiesto Urbano (<code>vp_rou_id</code>):
              </label>
              <input
                id="route_id_input"
                type="text"
                placeholder="Ejemplo: 1164838"
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className={styles.modalInput}
                autoFocus
              />
              <span className={styles.fieldHelp}>
                El sistema consultará el manifiesto de esta ruta en Urbano e indexará automáticamente el <code>man_id_det</code> de todas sus guías.
              </span>
            </div>
          ) : (
            <div className={styles.formField}>
              <label htmlFor="man_id_input">
                Identificador Interno (<code>man_id_det</code>):
              </label>
              <input
                id="man_id_input"
                type="text"
                placeholder="Ejemplo: 44383496"
                value={manualManIdDet}
                onChange={(e) => setManualManIdDet(e.target.value)}
                className={styles.modalInput}
                autoFocus
              />
              <span className={styles.fieldHelp}>
                Guarda la asociación directa de esta guía con su <code>man_id_det</code> para permitir la consulta y subida de fotos.
              </span>
            </div>
          )}

          {error && <div className={styles.alertError}>{error}</div>}
          {successMsg && <div className={styles.alertSuccess}>{successMsg}</div>}

          <div className={styles.assignModalFooter}>
            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={isLoading}
            >
              {isLoading
                ? 'Procesando en Urbano...'
                : mode === 'ROUTE'
                ? 'Resolver e Indexar Ruta'
                : 'Guardar Identificador'}
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
