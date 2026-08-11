import { MessageCircleOff, Package, Send } from 'lucide-react';
import type { calculateRouteStats } from '../domain';
import styles from './RouteDetailStats.module.css';

type RouteStats = ReturnType<typeof calculateRouteStats>;

export function RouteDetailStats({ stats }: { stats: RouteStats }) {
  const metrics = [
    {
      label: 'Pendientes',
      value: stats.pendientes,
      percentage: stats.pendientesPct,
      tone: styles.pending,
      icon: Package,
    },
    {
      label: 'Enviados',
      value: stats.enviados,
      percentage: stats.enviadosPct,
      tone: styles.sent,
      icon: Send,
    },
    {
      label: 'No tiene WhatsApp',
      value: stats.fallidos,
      percentage: stats.fallidosPct,
      tone: styles.failed,
      icon: MessageCircleOff,
    },
  ];

  return (
    <section className={styles.grid} aria-label="Indicadores de destinatarios">
      {metrics.map((metric) => {
        const Icon = metric.icon;

        return (
          <article className={`${styles.card} ${metric.tone}`} key={metric.label}>
            <span className={styles.icon}>
              <Icon size={18} aria-hidden="true" />
            </span>
            <div className={styles.content}>
              <div className={styles.valueRow}>
                <strong>{metric.value}</strong>
                <span>{metric.percentage}%</span>
              </div>
              <span className={styles.label}>{metric.label}</span>
              <span className={styles.track} aria-hidden="true">
                <span style={{ width: `${metric.percentage}%` }} />
              </span>
            </div>
          </article>
        );
      })}
    </section>
  );
}
