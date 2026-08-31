import type { FormEvent } from 'react';
import { ArrowUpDown, Download, MapPin, Search, Send, Truck } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import type { LookupFilters, RouteDestination } from '../types';
import styles from '../RouteLookup.module.css';
import { DestinationPicker } from './DestinationPicker';

type Props = {
  routeId: string;
  loading: boolean;
  importing: boolean;
  connected: boolean;
  localities: string[];
  filters: LookupFilters;
  destinations: RouteDestination[];
  selectedDestinationId: string;
  resultCount: number;
  canManage: boolean;
  onRouteId: (value: string) => void;
  onFilters: (value: LookupFilters) => void;
  onDestination: (value: string) => void;
  onLookup: () => void;
  onExport: () => void;
  onImport: () => void;
};

export function RouteLookupPanel(props: Props) {
  const submit = (event: FormEvent) => { event.preventDefault(); props.onLookup(); };
  const update = <K extends keyof LookupFilters>(key: K, value: LookupFilters[K]) => props.onFilters({ ...props.filters, [key]: value });

  return (
    <section className={styles.lookupCard} aria-labelledby="route-lookup-title">
      <header className={styles.provider}>
        <span className={`${styles.providerDot} ${props.connected ? styles.connected : ''}`} aria-hidden="true" />
        <img className={styles.providerLogo} src="/img/urbano_sin_fondo.png" alt="Urbano" />
        <div className={styles.providerCopy}>
          <strong id="route-lookup-title">Urbano por sede configurado</strong>
          <span>{props.connected ? 'Conexión activa para esta sede.' : 'La conexión se iniciará automáticamente al consultar una ruta.'}</span>
        </div>
        <span className={`${styles.connection} ${props.connected ? styles.online : ''}`}><i />{props.connected ? 'Conectado' : 'En espera'}</span>
      </header>

      <div className={styles.searchArea}>
        <form className={styles.lookupForm} onSubmit={submit}>
          <label className={styles.routeField}>
            <span><Truck />Número de ruta</span>
            <div><Search /><input aria-label="Número de ruta Urbano" inputMode="numeric" autoComplete="off" placeholder="Ej. 1044897" value={props.routeId} disabled={props.loading} onChange={event => props.onRouteId(event.target.value)} /></div>
          </label>
          <Button className={styles.lookupButton} type="submit" icon={<Search />} loading={props.loading} disabled={!props.routeId}>Consultar ruta</Button>
        </form>

        <div className={`${styles.filters} ${props.canManage ? '' : styles.readOnlyFilters}`}>
          <SelectField label="Localidad" icon={<MapPin />} value={props.filters.locality} disabled={props.localities.length < 2} onChange={value => update('locality', value)}>
            <option value="">Todas las localidades</option>{props.localities.map(value => <option key={value} value={value}>{value}</option>)}
          </SelectField>
          <SelectField label="Ordenar por" icon={<ArrowUpDown />} value={props.filters.sort} disabled={!props.resultCount} onChange={value => update('sort', value as LookupFilters['sort'])}>
            <option value="default">Orden original</option><option value="guia-asc">Guía A–Z</option><option value="cliente-asc">Cliente A–Z</option><option value="localidad-asc">Localidad A–Z</option>
          </SelectField>
          {props.canManage && (
            <div className={styles.destinationField}>
              <span><MapPin />Ruta destino</span>
              <DestinationPicker destinations={props.destinations} value={props.selectedDestinationId} disabled={!props.destinations.length} onChange={props.onDestination} />
            </div>
          )}
          <div className={styles.actions}>
            <span className={styles.actionLabel}>Acciones</span>
            <div>
              <Button className={styles.exportButton} type="button" variant="secondary" icon={<Download />} disabled={!props.resultCount || props.importing} onClick={props.onExport}>Excel</Button>
              {props.canManage && <Button className={styles.importButton} type="button" icon={<Send />} loading={props.importing} disabled={!props.resultCount || !props.selectedDestinationId} onClick={props.onImport}>Enviar al lote</Button>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SelectField({ label, icon, value, disabled, onChange, children }: { label: string; icon?: React.ReactNode; value: string; disabled: boolean; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className={styles.selectField}><span>{icon}{label}</span><select value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}
