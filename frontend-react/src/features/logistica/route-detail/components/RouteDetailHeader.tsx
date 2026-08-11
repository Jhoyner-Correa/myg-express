import type { CSSProperties } from 'react';
import { Activity, CalendarDays, MapPin, Users } from 'lucide-react';
import { formatDateOnly, getBadgeClass, getBadgeLabel } from '../domain';
import type { QueueControl, RouteDetail } from '../types';
import styles from './RouteDetailHeader.module.css';

interface RouteDetailHeaderProps {
  route: RouteDetail | null;
  total: number;
  processed: number;
  percentage: number;
  queue: QueueControl | null;
  onOpenQueue: () => void;
}

const badgeStyles = {
  activo: styles.success,
  completado: styles.success,
  progress: styles.success,
  pausado: styles.warning,
  pendiente: styles.neutral,
  cancelado: styles.danger,
} as const;

export function RouteDetailHeader({
  route,
  total,
  processed,
  percentage,
  queue,
  onOpenQueue,
}: RouteDetailHeaderProps) {
  const interrupted = Boolean(
    queue?.isProcessing || queue?.isPaused || queue?.hasInterruptedFlow,
  );
  const badge = getBadgeClass(route?.estado || 'pendiente');
  const badgeTone = badgeStyles[badge as keyof typeof badgeStyles] ?? styles.neutral;
  const progressStyle = {
    '--progress-angle': `${Math.min(100, Math.max(0, percentage)) * 3.6}deg`,
  } as CSSProperties;

  return (
    <section className={styles.header} aria-labelledby="route-detail-title">
      <div className={styles.identity}>
        <span className={styles.eyebrow}>Detalle de ruta</span>
        <div className={styles.titleRow}>
          <h1 id="route-detail-title" className={styles.title}>
            {route?.nombre_lote || `Ruta ${route?.id || ''}`}
          </h1>
          <span className={`${styles.badge} ${badgeTone}`}>
            <span className={styles.badgeDot} aria-hidden="true" />
            {getBadgeLabel(route?.estado || 'pendiente')}
          </span>
        </div>

        <dl className={styles.metadata}>
          <div>
            <dt><CalendarDays size={13} aria-hidden="true" /> Fecha</dt>
            <dd>{route?.fecha ? formatDateOnly(route.fecha) : '-'}</dd>
          </div>
          <div>
            <dt><MapPin size={13} aria-hidden="true" /> Sede</dt>
            <dd>{route?.sede_nombre || '-'}</dd>
          </div>
          <div>
            <dt><Users size={13} aria-hidden="true" /> Destinatarios</dt>
            <dd>{total}</dd>
          </div>
          <div className={styles.observation}>
            <dt>Observación</dt>
            <dd>{route?.observacion || 'Sin observaciones'}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.actions}>
        {interrupted && (
          <button
            type="button"
            className={`${styles.queueButton} ${queue?.isProcessing ? styles.processing : styles.paused}`}
            onClick={onOpenQueue}
          >
            <Activity size={16} aria-hidden="true" />
            <span>
              <strong>{queue?.isProcessing ? 'Envío en curso' : 'Ruta pausada'}</strong>
              <small>{queue?.isProcessing ? 'Gestionar cola' : 'Revisar decisión'}</small>
            </span>
          </button>
        )}

        <div
          className={styles.progress}
          aria-label={`Progreso de la ruta: ${percentage}%`}
        >
          <div className={styles.progressRing} style={progressStyle}>
            <span>{percentage}%</span>
          </div>
          <div className={styles.progressCopy}>
            <strong>Progreso de la ruta</strong>
            <span>
              {total === 0
                ? 'Sin actividad registrada'
                : `${processed} de ${total} procesados`}
            </span>
            <div className={styles.progressTrack} aria-hidden="true">
              <span style={{ width: `${percentage}%` }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
