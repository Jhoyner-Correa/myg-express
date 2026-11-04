import React, { useState } from 'react';
import { CheckCircle2, Route, Tag, X } from 'lucide-react';
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
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 800 }}>
            Resolver / Asignar Identificador de Ruta
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ background: '#f1f5f9', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', color: '#334155' }}>
          <span>Guía objetivo: </span>
          <strong className={styles.guideCode}>{guide.guia}</strong>
          {guide.destinatario && <span> · {guide.destinatario}</span>}
        </div>

        <div className={styles.tabGroup} style={{ width: '100%' }}>
          <button
            type="button"
            className={`${styles.tabItem} ${mode === 'ROUTE' ? styles.tabItemActive : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
            onClick={() => setMode('ROUTE')}
          >
            <Route size={12} style={{ display: 'inline', marginRight: '4px' }} />
            1. Por Ruta de Manifiesto
          </button>
          <button
            type="button"
            className={`${styles.tabItem} ${mode === 'MANUAL' ? styles.tabItemActive : ''}`}
            style={{ flex: 1, textAlign: 'center' }}
            onClick={() => setMode('MANUAL')}
          >
            <Tag size={12} style={{ display: 'inline', marginRight: '4px' }} />
            2. Ingreso Directo de man_id_det
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {mode === 'ROUTE' ? (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>
                <span>Número de Ruta Urbano (vp_rou_id)</span>
              </div>
              <input
                type="text"
                placeholder="Ejemplo: 1164838"
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                className={styles.routeInput}
                autoFocus
              />
              <span style={{ fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>
                Consulta el manifiesto de la ruta e indexa el <code>man_id_det</code> de todas sus guías automáticamente.
              </span>
            </div>
          ) : (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>
                <span>Identificador Interno (man_id_det)</span>
              </div>
              <input
                type="text"
                placeholder="Ejemplo: 44383496"
                value={manualManIdDet}
                onChange={(e) => setManualManIdDet(e.target.value)}
                className={styles.routeInput}
                autoFocus
              />
              <span style={{ fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>
                Asocia directamente este identificador para habilitar la consulta y carga de fotos de esta guía.
              </span>
            </div>
          )}

          {error && <div className={styles.alertError}>{error}</div>}
          {successMsg && (
            <div className={styles.alertSuccess}>
              <CheckCircle2 size={13} style={{ display: 'inline', marginRight: '4px' }} />
              {successMsg}
            </div>
          )}

          <div className={styles.modalFooter}>
            <button
              type="submit"
              className={styles.btnAuditPrimary}
              style={{ flex: 1, height: '32px' }}
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
              className={styles.btnSecondary}
              style={{ height: '32px' }}
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
