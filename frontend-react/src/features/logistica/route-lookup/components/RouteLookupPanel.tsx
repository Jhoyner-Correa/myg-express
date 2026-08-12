import type { FormEvent } from 'react';
import { Download, MapPin, Search, Send, Truck } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { destinationLabel } from '../domain';
import type { LookupFilters, RouteDestination } from '../types';
import styles from '../RouteLookup.module.css';

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
        <span className={`${styles.providerIcon} ${props.connected ? styles.connected : ''}`}><Truck /></span>
        <div><strong id="route-lookup-title">Consulta integrada con Urbano</strong><span>{props.connected ? 'ConexiÃ³n activa para esta sede' : 'La sesiÃ³n se iniciarÃ¡ al consultar'}</span></div>
        <span className={`${styles.connection} ${props.connected ? styles.online : ''}`}><i />{props.connected ? 'Conectado' : 'En espera'}</span>
      </header>

      <form className={styles.lookupForm} onSubmit={submit}>
        <label className={styles.routeField}><span>NÃºmero de ruta</span><div><Search /><input aria-label="NÃºmero de ruta Urbano" inputMode="numeric" autoComplete="off" placeholder="Ej. 1044897" value={props.routeId} disabled={props.loading} onChange={event => props.onRouteId(event.target.value)} /></div></label>
        <Button type="submit" loading={props.loading} disabled={!props.routeId}>Consultar ruta</Button>
      </form>

      <div className={styles.filters}>
        <SelectField label="Localidad" icon={<MapPin />} value={props.filters.locality} disabled={props.localities.length < 2} onChange={value => update('locality', value)}>
          <option value="">Todas las localidades</option>{props.localities.map(value => <option key={value} value={value}>{value}</option>)}
        </SelectField>
        <SelectField label="Orden" value={props.filters.sort} disabled={!props.resultCount} onChange={value => update('sort', value as LookupFilters['sort'])}>
          <option value="default">Orden original</option><option value="guia-asc">GuÃ­a Aâ€“Z</option><option value="cliente-asc">Cliente Aâ€“Z</option><option value="localidad-asc">Localidad Aâ€“Z</option>
        </SelectField>
        <SelectField label="Contrato" value={props.filters.contract} disabled={!props.resultCount} onChange={value => update('contract', value as LookupFilters['contract'])}>
          <option value="">Todos</option><option value="temu">Solo Temu</option><option value="no-temu">Sin Temu</option>
        </SelectField>
        {props.canManage && <SelectField label="Ruta destino" value={props.selectedDestinationId} disabled={!props.destinations.length} onChange={props.onDestination} wide>
          <option value="">Seleccionar lote del dÃ­a</option>{props.destinations.map(route => <option key={route.id} value={route.id}>{destinationLabel(route)}</option>)}
        </SelectField>}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" size="sm" icon={<Download />} disabled={!props.resultCount || props.importing} onClick={props.onExport}>Excel</Button>
          {props.canManage && <Button type="button" size="sm" icon={<Send />} loading={props.importing} disabled={!props.resultCount || !props.selectedDestinationId} onClick={props.onImport}>Enviar al lote</Button>}
        </div>
      </div>
      {props.canManage && !props.destinations.length && <p className={styles.destinationHint}>No hay lotes activos creados hoy en esta sede.</p>}
    </section>
  );
}

function SelectField({ label, icon, value, disabled, onChange, children, wide = false }: { label: string; icon?: React.ReactNode; value: string; disabled: boolean; onChange: (value: string) => void; children: React.ReactNode; wide?: boolean }) {
  return <label className={`${styles.selectField} ${wide ? styles.wide : ''}`}><span>{icon}{label}</span><select value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}
