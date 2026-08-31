import { Download, FileBarChart2, Play, Search, Trash2 } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { MONTHS_ES, lotProgress, statusLabel } from '../domain';
import type { ExportStatus, SavarLot, SavarPackage, SavarTab } from '../types';
import styles from '../SavarScan.module.css';

type Props = {
  tab: SavarTab;
  history: SavarPackage[];
  lots: SavarLot[];
  months: string[];
  lotFilter: string;
  monthFilter: string;
  canManage: boolean;
  onTab: (tab: SavarTab) => void;
  onLotFilter: (value: string) => void;
  onMonthFilter: (value: string) => void;
  onActivate: (name: string) => void;
  onExport: (name: string, status?: ExportStatus) => void;
  onDelete: (name: string) => void;
  onExportSummary: () => void;
};

export function SavarRecordsPanel(props: Props) {
  return (
    <section className={`${styles.card} ${styles.recordsCard}`}>
      <div className={styles.tabs} role="tablist" aria-label="Vistas de SAVAR SCAN">
        <button type="button" role="tab" aria-selected={props.tab === 'escaneo'} className={props.tab === 'escaneo' ? styles.active : ''} onClick={() => props.onTab('escaneo')}>Escaneos de la sesión</button>
        <button type="button" role="tab" aria-selected={props.tab === 'reportes'} className={props.tab === 'reportes' ? styles.active : ''} onClick={() => props.onTab('reportes')}>Historial y reportes</button>
      </div>
      {props.tab === 'escaneo' ? <SessionTable history={props.history} /> : <ReportsTable {...props} />}
    </section>
  );
}

function SessionTable({ history }: { history: SavarPackage[] }) {
  return (
    <div className={styles.panelBody} role="tabpanel">
      <header className={styles.tableHeading}><div><strong>Registros de la sesión actual</strong><span>Últimos movimientos procesados</span></div><small>{history.length} leídos</small></header>
      <div className={styles.tableScroll} role="region" aria-label="Historial de escaneos" tabIndex={0}>
        <table><thead><tr><th>#</th><th>Código</th><th>Consignado</th><th>Dirección</th><th>Distrito</th><th>Estado</th><th>Hora</th></tr></thead>
          <tbody>{history.length ? history.map((item, index) => {
            const status = statusLabel(item.estado);
            return <tr key={`${item.id}-${index}`}><td>{index + 1}</td><td className={styles.code}>{item.codigo_paquete || item.codigo_escaneado || '—'}</td><td>{item.consignado || item.nombre || '—'}</td><td>{item.direccion || '—'}</td><td>{item.distrito || '—'}</td><td><span className={`${styles.status} ${styles[status.tone]}`}>{status.label}</span></td><td>{item.fecha_escaneo ? new Date(item.fecha_escaneo).toLocaleTimeString('es-PE') : '—'}</td></tr>;
          }) : <tr><td colSpan={7} className={styles.empty}>No se han registrado escaneos en esta sesión.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsTable(props: Props) {
  return (
    <div className={styles.panelBody} role="tabpanel">
      <div className={styles.reportToolbar}>
        <label><Search aria-hidden="true" /><span className="sr-only">Buscar lote</span><input value={props.lotFilter} onChange={event => props.onLotFilter(event.target.value)} placeholder="Buscar lote..." /></label>
        <select aria-label="Filtrar por mes" value={props.monthFilter} onChange={event => props.onMonthFilter(event.target.value)}>
          <option value="">Todos los meses</option>{props.months.map(month => { const [number, year] = month.split('/'); return <option key={month} value={month}>{MONTHS_ES[Number(number) - 1]} {year}</option>; })}
        </select>
        <Button size="sm" icon={<FileBarChart2 aria-hidden="true" />} onClick={props.onExportSummary}>Exportar consolidado</Button>
      </div>
      <div className={styles.tableScroll} role="region" aria-label="Reportes por lote" tabIndex={0}>
        <table><thead><tr><th>Lote / carga</th><th>Fecha</th><th>Total</th><th>Llegaron</th><th>Faltan</th><th>Efectividad</th><th>Acciones</th></tr></thead>
          <tbody>{props.lots.length ? props.lots.map(lot => { const progress = lotProgress(lot); return (
            <tr key={lot.nombre}><td className={styles.lotName}>{lot.nombre}</td><td>{lot.fecha_creacion ? new Date(lot.fecha_creacion).toLocaleDateString('es-PE') : '—'}</td><td>{lot.total}</td><td>{lot.recibidos}</td><td>{Math.max(0, lot.total - lot.recibidos)}</td><td><div className={styles.miniProgress}><span><i style={{ width: `${progress}%` }} /></span><strong>{progress}%</strong></div></td><td><div className={styles.rowActions}>
              <IconButton label={`Activar ${lot.nombre}`} icon={<Play />} onClick={() => props.onActivate(lot.nombre)} />
              <IconButton label={`Exportar recibidos de ${lot.nombre}`} icon={<Download />} onClick={() => props.onExport(lot.nombre)} />
              <IconButton label={`Exportar faltantes de ${lot.nombre}`} icon={<FileBarChart2 />} onClick={() => props.onExport(lot.nombre, 'PENDIENTE')} />
              {props.canManage && <IconButton danger label={`Eliminar ${lot.nombre}`} icon={<Trash2 />} onClick={() => props.onDelete(lot.nombre)} />}
            </div></td></tr>);
          }) : <tr><td colSpan={7} className={styles.empty}>No hay cargas que coincidan con los filtros.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

function IconButton({ label, icon, danger = false, onClick }: { label: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }) {
  return <button className={`${styles.iconButton} ${danger ? styles.dangerAction : ''}`} type="button" title={label} aria-label={label} onClick={onClick}>{icon}</button>;
}
