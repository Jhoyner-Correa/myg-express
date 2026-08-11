import { useEffect, useRef, useState } from 'react';
import { BarChart3, ChevronRight, Edit3, FileCheck2, MoreVertical, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { RouteItem } from '../types';
import styles from './RouteRowActions.module.css';

type RouteRowActionsProps = {
  route: RouteItem;
  canEdit: boolean;
  onReport: () => void;
  onEdit: () => void;
  onEnableDeliveries: () => void;
  onDelete: () => void;
  onViewDetail: () => void;
};

type MenuPosition = { top: number; left: number };

export function RouteRowActions({
  route,
  canEdit,
  onReport,
  onEdit,
  onEnableDeliveries,
  onDelete,
  onViewDetail,
}: RouteRowActionsProps) {
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const deliveriesEnabled = route.entregas_habilitado === 1;
  const deliveriesDisabled = deliveriesEnabled || route.total_registros <= 0;

  useEffect(() => {
    if (!menuPosition) return;
    const close = (event: Event) => {
      if (event instanceof PointerEvent && triggerRef.current?.contains(event.target as Node)) return;
      setMenuPosition(null);
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menuPosition]);

  const toggleMenu = () => {
    if (menuPosition) return setMenuPosition(null);
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({ top: rect.bottom + 6, left: Math.max(8, rect.right - 210) });
  };

  const execute = (action: () => void) => {
    setMenuPosition(null);
    action();
  };

  return (
    <div className={styles.actions}>
      <button className={styles.iconButton} type="button" onClick={onReport} title="Ver reporte" aria-label={`Ver reporte de MYG-${route.id}`}>
        <BarChart3 aria-hidden="true" />
      </button>
      {canEdit && (
        <button className={styles.iconButton} type="button" onClick={onEdit} title="Editar ruta" aria-label={`Editar MYG-${route.id}`}>
          <Edit3 aria-hidden="true" />
        </button>
      )}
      <button ref={triggerRef} className={styles.iconButton} type="button" onClick={toggleMenu} aria-haspopup="menu" aria-expanded={Boolean(menuPosition)} aria-label={`Más opciones para MYG-${route.id}`}>
        <MoreVertical aria-hidden="true" />
      </button>
      <button className={styles.detail} type="button" onClick={onViewDetail}>
        Ver detalle<ChevronRight aria-hidden="true" />
      </button>

      {menuPosition && createPortal(
        <div className={styles.menu} role="menu" style={menuPosition}>
          <button
            type="button"
            role="menuitem"
            disabled={deliveriesDisabled}
            onClick={() => execute(onEnableDeliveries)}
          >
            <FileCheck2 aria-hidden="true" />
            {deliveriesEnabled ? 'Ya está en entregas' : route.total_registros <= 0 ? 'Sin paquetes para entregas' : 'Enviar a entregas'}
          </button>
          <button className={styles.danger} type="button" role="menuitem" onClick={() => execute(onDelete)}>
            <Trash2 aria-hidden="true" />Eliminar ruta
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
