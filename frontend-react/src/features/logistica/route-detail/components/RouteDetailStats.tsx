import { MessageCircleOff, Package, Send } from 'lucide-react';
import type { calculateRouteStats } from '../domain';

type RouteStats = ReturnType<typeof calculateRouteStats>;

export function RouteDetailStats({ stats }: { stats: RouteStats }) {
  const metrics = [
    { label: 'Pendientes', value: stats.pendientes, percentage: stats.pendientesPct, tone: 'pending', icon: Package },
    { label: 'Enviados', value: stats.enviados, percentage: stats.enviadosPct, tone: 'sent', icon: Send },
    { label: 'No tiene WhatsApp', value: stats.fallidos, percentage: stats.fallidosPct, tone: 'failed', icon: MessageCircleOff },
  ] as const;

  return (
    <section className="new-stats-row" aria-label="Indicadores de destinatarios">
      {metrics.map(metric => {
        const Icon = metric.icon;
        return (
          <article className={`new-stat-card rd-stat-${metric.tone}`} key={metric.label}>
            <div className="new-stat-icon-wrap"><Icon size={22} aria-hidden="true" /></div>
            <div className="new-stat-body">
              <div className="new-stat-top">
                <strong className="new-stat-num">{metric.value}</strong>
                <span className="new-stat-pct">{metric.percentage}%</span>
              </div>
              <div className="new-stat-lbl">{metric.label}</div>
              <div className="new-stat-track" aria-hidden="true">
                <span className="new-stat-bar" style={{ width: `${metric.percentage}%` }} />
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
