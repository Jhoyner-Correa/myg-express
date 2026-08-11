import { Clock3 } from 'lucide-react';
import { formatDateOnly, getBadgeClass, getBadgeLabel } from '../domain';
import type { QueueControl, RouteDetail } from '../types';

type Props = {
  route: RouteDetail | null;
  total: number;
  processed: number;
  percentage: number;
  queue: QueueControl | null;
  onOpenQueue: () => void;
};

export function RouteDetailHeader({ route, total, processed, percentage, queue, onOpenQueue }: Props) {
  const interrupted = queue?.isProcessing || queue?.isPaused || queue?.hasInterruptedFlow;
  return (
    <section className="pg-hero" aria-labelledby="route-detail-title">
      <div className="pg-hero-left">
        <div className="pg-breadcrumb">Detalle de ruta</div>
        <div className="pg-title-row">
          <h1 className="pg-title" id="route-detail-title">{route?.nombre_lote || `Ruta ${route?.id || ''}`}</h1>
          <span className={`pg-badge pg-badge-${getBadgeClass(route?.estado || 'pendiente')}`}>{getBadgeLabel(route?.estado || 'pendiente')}</span>
          {interrupted && <button type="button" className={`envio-control-trigger ${queue?.isProcessing ? 'is-processing' : 'is-paused'}`} onClick={onOpenQueue}>
            <span className="envio-control-trigger-dot" aria-hidden="true" /><span><strong>{queue?.isProcessing ? 'Envío en curso' : 'Ruta pausada'}</strong><small>{queue?.isProcessing ? 'Gestionar' : 'Revisar decisión'}</small></span>
          </button>}
        </div>
        <div className="pg-meta-strip"><div className="pg-meta-row">
          <div className="pg-meta-item">Fecha: <span className="pg-meta-val">{route?.fecha ? formatDateOnly(route.fecha) : '-'}</span></div><span className="pg-meta-sep">|</span>
          <div className="pg-meta-item">Sede: <span className="pg-meta-val">{route?.sede_nombre || '-'}</span></div><span className="pg-meta-sep">|</span>
          <div className="pg-meta-item">Destinatarios: <span className="pg-meta-val">{total}</span></div><span className="pg-meta-sep">|</span>
          <div className="pg-meta-item">Observación: <span className="pg-meta-val">{route?.observacion || 'Sin observaciones'}</span></div>
          <section className={`route-progress-card ${queue?.isProcessing ? 'is-active' : ''}`} aria-label={`Progreso de la ruta: ${percentage}%`}>
            <div className="route-progress-ring" style={{ '--progress': percentage } as React.CSSProperties}><span>{percentage}%</span></div>
            <div className="route-progress-content"><div className="route-progress-title">Progreso de la ruta</div><div className="route-progress-note">{total === 0 ? 'Sin actividad registrada' : `${processed} de ${total} destinatarios procesados`}</div><div className="route-progress-track"><span style={{ width: `${percentage}%` }} /></div><Clock3 className="rpc-idle-icon" size={28} aria-hidden="true" /></div>
          </section>
        </div></div>
      </div>
    </section>
  );
}
