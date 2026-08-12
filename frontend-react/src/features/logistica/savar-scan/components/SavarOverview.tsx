import { AlertCircle, CheckCircle2, Download, Package, RefreshCw, Upload, Zap } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { lotProgress } from '../domain';
import type { SavarLot } from '../types';
import styles from '../SavarScan.module.css';

type Props = {
  lots: SavarLot[];
  activeLotName: string;
  incidents: number;
  canManage: boolean;
  onSelect: (name: string) => void;
  onOpenMissing: () => void;
  onImport: () => void;
  onExport: () => void;
  onReset: () => void;
};

export function SavarOverview({ lots, activeLotName, incidents, canManage, onSelect, onOpenMissing, onImport, onExport, onReset }: Props) {
  const activeLot = lots.find(lot => lot.nombre === activeLotName) ?? null;
  const progress = lotProgress(activeLot);
  const stats = [
    { label: 'Total del lote', value: activeLot?.total ?? 0, icon: Package, tone: styles.info },
    { label: 'Recibidos', value: activeLot?.recibidos ?? 0, icon: CheckCircle2, tone: styles.success },
    { label: 'Faltantes', value: activeLot ? Math.max(0, activeLot.total - activeLot.recibidos) : 0, icon: Package, tone: styles.warning },
    { label: 'Incidencias', value: incidents, icon: AlertCircle, tone: styles.danger },
  ];

  return (
    <section className={styles.overviewGrid}>
      <article className={styles.card}>
        <header className={styles.lotHeader}>
          <div className={styles.lotTitle}>
            <Package aria-hidden="true" />
            <span>Lote activo</span>
            <strong>{activeLotName || 'Ninguno'}</strong>
          </div>
          <div className={styles.lotControls}>
            <label>
              <span className="sr-only">Seleccionar lote activo</span>
              <select value={activeLotName} onChange={event => onSelect(event.target.value)}>
                <option value="">Selecciona un lote</option>
                {lots.map(lot => <option key={lot.nombre} value={lot.nombre}>{lot.nombre}</option>)}
              </select>
            </label>
            <Button variant="secondary" size="sm" disabled={!activeLotName} onClick={onOpenMissing}>Ver faltantes</Button>
          </div>
        </header>

        <div className={styles.stats}>
          {stats.map(stat => {
            const Icon = stat.icon;
            return (
              <div className={`${styles.stat} ${stat.tone}`} key={stat.label}>
                <span><Icon aria-hidden="true" /></span>
                <div><small>{stat.label}</small><strong>{stat.value}</strong></div>
              </div>
            );
          })}
        </div>

        <div className={styles.progressCopy}><span>Progreso de recepción</span><strong>{progress}%</strong></div>
        <div className={styles.progress} aria-label={`Progreso ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        {progress === 100 && Boolean(activeLot?.total) && (
          <div className={styles.complete}><CheckCircle2 aria-hidden="true" />Carga completada: todos los paquetes fueron recibidos.</div>
        )}
      </article>

      <article className={`${styles.card} ${styles.quickActions}`}>
        <header><Zap aria-hidden="true" /><div><strong>Acciones rápidas</strong><span>Operaciones del lote actual</span></div></header>
        {canManage && <Button icon={<Upload aria-hidden="true" />} onClick={onImport}>Importar catálogo</Button>}
        <Button variant="secondary" icon={<Download aria-hidden="true" />} disabled={!activeLotName} onClick={onExport}>Exportar escaneados</Button>
        {canManage && <Button variant="secondary" icon={<RefreshCw aria-hidden="true" />} disabled={!activeLotName} onClick={onReset}>Reiniciar lote</Button>}
      </article>
    </section>
  );
}
