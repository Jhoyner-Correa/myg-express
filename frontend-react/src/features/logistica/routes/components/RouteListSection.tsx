import type { ReactNode } from 'react';
import { ChevronRight, Eye, MapPin } from 'lucide-react';
import type { RouteItem } from '../types';
import { formatRouteDateTime, routeStatusLabel, routeStatusTone } from '../formatters';
import styles from './RouteListSection.module.css';

type RouteListSectionProps = {
  id: string;
  title: string;
  routes: RouteItem[];
  dateHeading: string;
  getDate: (route: RouteItem) => string | undefined;
  emptyTitle: string;
  emptyDescription?: string;
  renderActions: (route: RouteItem) => ReactNode;
  onViewAll?: () => void;
  viewAllLabel?: string;
  onViewOverflow?: () => void;
  limit?: number;
};

export function RouteListSection({
  id,
  title,
  routes,
  dateHeading,
  getDate,
  emptyTitle,
  emptyDescription,
  renderActions,
  onViewAll,
  viewAllLabel = 'Ver historial completo',
  onViewOverflow,
  limit = 5,
}: RouteListSectionProps) {
  const visibleRoutes = routes.slice(0, limit);

  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.card}>
        <header className={styles.sectionHeader}>
          <div className={styles.titleGroup}>
            <h2 id={id}>{title}</h2>
            <span className={styles.count}>{routes.length} {routes.length === 1 ? 'ruta' : 'rutas'}</span>
          </div>
          {onViewAll && (
            <button className={styles.viewAll} type="button" onClick={onViewAll}>
              {viewAllLabel}<ChevronRight aria-hidden="true" />
            </button>
          )}
        </header>

        <div className={styles.scrollArea}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>N°</th>
                <th>Ruta</th>
                <th>Zona</th>
                <th>Paquetes</th>
                <th>Estado</th>
                <th>{dateHeading}</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibleRoutes.map((route, index) => (
                <tr key={route.id}>
                  <td><span className={styles.index}>{index + 1}</span></td>
                  <td><strong className={styles.code}>MYG-{route.id}</strong></td>
                  <td>
                    <span className={styles.zone}><MapPin aria-hidden="true" />{route.nombre_lote}</span>
                  </td>
                  <td className={styles.center}>{route.total_registros}</td>
                  <td>
                    <span className={`${styles.status} ${styles[routeStatusTone(route.estado)]}`}>
                      <span aria-hidden="true" />{routeStatusLabel(route.estado)}
                    </span>
                  </td>
                  <td><time className={styles.date}>{formatRouteDateTime(getDate(route))}</time></td>
                  <td><div className={styles.actions}>{renderActions(route)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>

          {routes.length === 0 && (
            <div className={styles.empty} role="status">
              <span className={styles.emptyIcon}><MapPin aria-hidden="true" /></span>
              <strong>{emptyTitle}</strong>
              {emptyDescription && <p>{emptyDescription}</p>}
            </div>
          )}
        </div>

        {routes.length > limit && onViewOverflow && (
          <footer className={styles.overflowFooter}>
            <span>Mostrando {limit} de {routes.length} rutas</span>
            <button type="button" onClick={onViewOverflow}>
              <Eye aria-hidden="true" />Ver todas
            </button>
          </footer>
        )}
      </div>
    </section>
  );
}
