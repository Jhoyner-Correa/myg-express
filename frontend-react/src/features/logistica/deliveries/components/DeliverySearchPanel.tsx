import type { FormEvent, RefObject } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { formatRelativeDeliveryDate, maskPhone } from '../domain';
import type { DeliveryClient, DeliveryFilters, DeliveryRouteOption } from '../types';
import styles from '../Deliveries.module.css';

type Props = {
  inputRef: RefObject<HTMLInputElement | null>;
  filters: DeliveryFilters;
  routes: DeliveryRouteOption[];
  clients: DeliveryClient[];
  selectedKey?: string;
  searching: boolean;
  hasSearched: boolean;
  error?: string;
  onFilters: (filters: DeliveryFilters) => void;
  onSearch: () => void;
  onReset: () => void;
  onSelect: (client: DeliveryClient) => void;
};

export function DeliverySearchPanel(props: Props) {
  const submit = (event: FormEvent) => { event.preventDefault(); props.onSearch(); };
  const update = <K extends keyof DeliveryFilters>(key: K, value: DeliveryFilters[K]) => props.onFilters({ ...props.filters, [key]: value });

  return (
    <aside className={`${styles.card} ${styles.searchPanel}`}>
      <form onSubmit={submit} className={styles.searchForm}>
        <label className={styles.searchInput}>
          <Search aria-hidden="true" />
          <span className="sr-only">Buscar cliente</span>
          <input
            ref={props.inputRef}
            type="search"
            autoComplete="off"
            placeholder="Nombre, teléfono o código de paquete"
            value={props.filters.query}
            onChange={event => update('query', event.target.value)}
          />
          {props.filters.query && (
            <button type="button" aria-label="Limpiar búsqueda" onClick={() => update('query', '')}><X /></button>
          )}
        </label>
        <div className={styles.filters}>
          <Filter label="Estado" value={props.filters.status} onChange={value => update('status', value as DeliveryFilters['status'])}>
            <option value="">Todos</option><option value="pendiente">Pendientes</option><option value="recogido">Recogidos</option>
          </Filter>
          <Filter label="Fecha" value={props.filters.date} onChange={value => update('date', value as DeliveryFilters['date'])}>
            <option value="">Todas</option><option value="hoy">Hoy</option><option value="ayer">Ayer</option><option value="7dias">7 días</option><option value="30dias">30 días</option>
          </Filter>
          <Filter label="Ruta" value={props.filters.routeId} onChange={value => update('routeId', value)}>
            <option value="">Todas</option>{props.routes.map(route => <option key={route.id} value={route.id}>{route.nombre_lote || `Ruta ${route.id}`}</option>)}
          </Filter>
        </div>
        <div className={styles.searchActions}>
          <Button type="submit" loading={props.searching}>Buscar</Button>
          <Button type="button" variant="ghost" onClick={props.onReset}>Limpiar</Button>
        </div>
      </form>

      <header className={styles.resultsHeader}>
        <div><strong>Clientes encontrados</strong><span>{resultSummary(props)}</span></div>
        {props.hasSearched && <small>{props.clients.length}</small>}
      </header>
      <div className={styles.clientList} aria-live="polite">
        {props.error ? <Empty title="No se pudo realizar la búsqueda" description={props.error} />
          : !props.hasSearched ? <Empty title="Busca un cliente" description="Usa nombre, teléfono, código o filtros." />
            : !props.clients.length ? <Empty title="Sin coincidencias" description="Prueba con otros datos o filtros." />
              : props.clients.map(client => <ClientCard key={client.cliente_key} client={client} active={props.selectedKey === client.cliente_key} onSelect={() => props.onSelect(client)} />)}
      </div>
    </aside>
  );
}

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}

function ClientCard({ client, active, onSelect }: { client: DeliveryClient; active: boolean; onSelect: () => void }) {
  return (
    <button className={`${styles.clientCard} ${active ? styles.active : ''}`} type="button" aria-pressed={active} onClick={onSelect}>
      <span className={styles.avatar}>{client.nombre?.trim().charAt(0).toUpperCase() || '?'}</span>
      <span className={styles.clientCopy}>
        <strong>{client.nombre || 'Sin nombre'}</strong>
        <span>{maskPhone(client.telefono)}</span>
        <small>Último ingreso: {formatRelativeDeliveryDate(client.ultimo_ingreso).toLocaleLowerCase('es')}</small>
      </span>
      <span className={styles.clientCounts}><strong>{client.pendientes}</strong><small>pendientes</small><span>{client.recogidos} recogidos</span></span>
    </button>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className={styles.empty}><Search aria-hidden="true" /><strong>{title}</strong><span>{description}</span></div>;
}

function resultSummary(props: Props) {
  if (!props.hasSearched) return 'Consulta los paquetes habilitados para entrega.';
  if (props.filters.query.trim() && props.clients.length) return `Resultados para “${props.filters.query.trim()}”`;
  return props.clients.length ? `${props.clients.length} clientes encontrados` : 'No se encontraron clientes.';
}
