import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Modal } from '../../../../components/ui/Modal/Modal';
import type { RouteItem } from '../types';
import { RouteListSection } from './RouteListSection';
import styles from './RoutesHistoryModal.module.css';

type HistoryStats = {
  totalRutas: number;
  totalPaquetes: number;
  promedio: number;
};

type RoutesHistoryModalProps = {
  open: boolean;
  scope: 'all' | 'today';
  routes: RouteItem[];
  query: string;
  stats: HistoryStats;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  getDate: (route: RouteItem) => string | undefined;
  renderActions: (route: RouteItem) => ReactNode;
};

export function RoutesHistoryModal({
  open,
  scope,
  routes,
  query,
  stats,
  onQueryChange,
  onClose,
  getDate,
  renderActions,
}: RoutesHistoryModalProps) {
  return (
    <Modal
      open={open}
      title={scope === 'today' ? 'Rutas de hoy' : 'Historial de rutas'}
      description={scope === 'today'
        ? 'Consulta todas las rutas registradas durante el día.'
        : 'Consulta las rutas registradas y su avance operativo.'}
      maxWidth={1180}
      onClose={onClose}
    >
      <div className={styles.layout}>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search aria-hidden="true" />
            <span className={styles.srOnly}>Buscar en el historial</span>
            <input
              type="search"
              placeholder="Buscar por código, zona, sede o estado"
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              autoFocus
            />
          </label>
          <div className={styles.stats} aria-label="Resumen del historial">
            <Stat label="Total rutas" value={stats.totalRutas} />
            <Stat label="Paquetes" value={stats.totalPaquetes} />
            <Stat label="Promedio" value={stats.promedio} />
          </div>
        </div>

        <RouteListSection
          id="history-results-title"
          title="Resultados"
          routes={routes}
          limit={Math.max(routes.length, 1)}
          dateHeading="Fecha"
          getDate={getDate}
          emptyTitle="No hay coincidencias"
          emptyDescription="Prueba con otro término de búsqueda."
          renderActions={renderActions}
        />
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <span className={styles.stat}><span>{label}</span><strong>{value}</strong></span>;
}
