import { CalendarDays, CheckCircle2, Download, Package, RotateCcw } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { PageLoader } from '../../../../components/ui/PageLoader/PageLoader';
import {
  formatRelativeDeliveryDate, formatWeight, latestPackageDate, packageDetail,
  packageTypeCode, packageTypeLabel, routeLabel, splitPackages,
} from '../domain';
import type { DeliveryClient, DeliveryPackage } from '../types';
import styles from '../Deliveries.module.css';

type Props = {
  client: DeliveryClient | null;
  packages: DeliveryPackage[];
  siteName: string;
  loading: boolean;
  error?: string;
  canManage: boolean;
  onExport: () => void;
  onDeliver: (item: DeliveryPackage) => void;
  onRevert: (item: DeliveryPackage) => void;
  onRetry: () => void;
};

export function DeliveryProfile(props: Props) {
  if (!props.client) return <Welcome />;
  if (props.loading) return <div className={styles.profileLoading}><PageLoader compact label="Cargando ficha del cliente" /><span>Cargando ficha del cliente...</span></div>;
  if (props.error) return <div className={styles.profileError}><strong>No se pudo cargar la ficha</strong><p>{props.error}</p><Button variant="secondary" onClick={props.onRetry}>Reintentar</Button></div>;

  const { pending, delivered } = splitPackages(props.packages);
  const latest = latestPackageDate(props.packages);
  return (
    <div className={styles.profile}>
      <header className={styles.profileHeader}>
        <div><span>Ficha del cliente</span><h2>{props.client.nombre || 'Sin nombre'}</h2><div className={styles.profileMeta}><span><small>Teléfono</small><strong>{props.client.telefono || 'No registrado'}</strong></span><span><small>Sede</small><strong>{props.client.sede_nombre || props.siteName || 'No asignada'}</strong></span></div></div>
        <Button variant="secondary" size="sm" icon={<Download />} disabled={!props.packages.length} onClick={props.onExport}>Exportar CSV</Button>
      </header>
      <div className={styles.metrics}>
        <Metric icon={<Package />} tone="blue" label="Pendientes por recoger" value={String(pending.length)} />
        <Metric icon={<CheckCircle2 />} tone="green" label="Recogidos" value={String(delivered.length)} />
        <Metric icon={<CalendarDays />} tone="amber" label="Último paquete ingresado" value={formatRelativeDeliveryDate(latest)} />
      </div>
      <div className={styles.tables}>
        <PackageTable title="Pendientes" items={pending} empty="Este cliente no tiene paquetes pendientes por recoger." mode="pending" canManage={props.canManage} onAction={props.onDeliver} />
        <PackageTable title="Historial" items={delivered} empty="Todavía no hay paquetes recogidos para este cliente." mode="history" canManage={props.canManage} onAction={props.onRevert} />
      </div>
    </div>
  );
}

function Metric({ icon, tone, label, value }: { icon: React.ReactNode; tone: 'blue' | 'green' | 'amber'; label: string; value: string }) {
  return <article className={styles.metric}><span className={styles[tone]}>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>;
}

function PackageTable({ title, items, empty, mode, canManage, onAction }: { title: string; items: DeliveryPackage[]; empty: string; mode: 'pending' | 'history'; canManage: boolean; onAction: (item: DeliveryPackage) => void }) {
  return (
    <section className={styles.tableSection}>
      <header><h3>{title}</h3><span>{items.length}</span></header>
      <div className={styles.tableScroll} role="region" aria-label={`${title} del cliente`} tabIndex={0}>
        <table>
          <thead><tr><th>Código</th><th>Ruta</th>{mode === 'pending' && <th>Ingreso</th>}<th>Peso</th><th>Tipo</th><th>{mode === 'pending' ? 'Estado' : 'Detalle'}</th>{canManage && <th>Acción</th>}</tr></thead>
          <tbody>{items.length ? items.map(item => (
            <tr key={item.id}>
              <td><span className={styles.code}>{item.codigo_paquete || 'Sin código'}</span></td>
              <td><span className={styles.route}>{routeLabel(item)}</span></td>
              {mode === 'pending' && <td>{formatRelativeDeliveryDate(item.fecha_ingreso)}</td>}
              <td className={styles.numeric}>{formatWeight(item.peso_kg)}</td>
              <td><span className={`${styles.packageType} ${styles[packageTypeCode(item)] ?? ''}`} title={packageDetail(item)}>{packageTypeLabel(item)}</span></td>
              <td>{mode === 'pending' ? <span className={styles.available}>Disponible</span> : item.observacion_entrega || 'Recogido en oficina'}</td>
              {canManage && <td><Button variant="ghost" size="sm" icon={mode === 'history' ? <RotateCcw /> : <CheckCircle2 />} onClick={() => onAction(item)}>{mode === 'history' ? 'Revertir' : 'Entregar'}</Button></td>}
            </tr>
          )) : <tr><td className={styles.tableEmpty} colSpan={canManage ? (mode === 'pending' ? 7 : 6) : (mode === 'pending' ? 6 : 5)}>{empty}</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}

function Welcome() {
  return (
    <div className={styles.welcome}>
      <span className={styles.welcomeIcon}><CheckCircle2 /></span>
      <h2>Entregas en oficina</h2><p>Busca un cliente, revisa sus paquetes y confirma la entrega.</p>
      <ol><li><SearchStep number="1" label="Buscar" /></li><li><SearchStep number="2" label="Seleccionar" /></li><li><SearchStep number="3" label="Entregar" /></li></ol>
    </div>
  );
}

function SearchStep({ number, label }: { number: string; label: string }) {
  return <><strong>{number}</strong><span>{label}</span></>;
}
