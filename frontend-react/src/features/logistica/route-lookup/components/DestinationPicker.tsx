import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin, Search } from 'lucide-react';
import { destinationLabel, normalizeSearchText } from '../domain';
import type { RouteDestination } from '../types';
import styles from '../RouteLookup.module.css';

type Props = {
  destinations: RouteDestination[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

const originName = (destination: RouteDestination) => String(destination.origen || 'Rutas del día').trim();

export function DestinationPicker({ destinations, value, disabled = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = destinations.find(destination => String(destination.id) === value);

  const groups = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    const visible = normalizedQuery
      ? destinations.filter(destination => normalizeSearchText([
        destination.nombre_lote, destination.zona, destination.origen, destination.id,
      ].join(' ')).includes(normalizedQuery))
      : destinations;
    const grouped = new Map<string, RouteDestination[]>();
    visible.forEach(destination => {
      const origin = originName(destination);
      grouped.set(origin, [...(grouped.get(origin) ?? []), destination]);
    });
    return [...grouped.entries()]
      .map(([origin, items]) => ({ origin, items }))
      .sort((left, right) => left.origin.localeCompare(right.origin, 'es', { sensitivity: 'base' }));
  }, [destinations, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (destination: RouteDestination) => {
    onChange(String(destination.id));
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={styles.destinationPicker} ref={rootRef}>
      <button type="button" className={`${styles.destinationTrigger} ${open ? styles.open : ''}`} aria-label={selected ? `Ruta destino: ${destinationLabel(selected)}` : 'Seleccionar ruta destino'} aria-expanded={open} aria-haspopup="listbox" disabled={disabled} onClick={() => setOpen(current => !current)}>
        <MapPin aria-hidden="true" />
        {selected ? (
          <span className={styles.selectedDestination}>
            <b>MYG-{selected.id}</b>
            <span>{destinationLabel(selected).replace(` · MYG-${selected.id}`, '')}</span>
          </span>
        ) : <span className={styles.destinationPlaceholder}>{destinations.length ? 'Seleccionar ruta destino' : 'Sin lotes activos hoy'}</span>}
        <ChevronDown className={styles.destinationChevron} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.destinationMenu}>
          <label className={styles.destinationSearch}>
            <Search aria-hidden="true" />
            <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar lote, zona u origen" aria-label="Buscar lote destino" />
          </label>
          <div className={styles.destinationList} role="listbox" aria-label="Rutas destino disponibles">
            {groups.length ? groups.map(group => (
              <div className={styles.destinationGroup} key={group.origin}>
                <div className={styles.destinationGroupHeader}><span>{group.origin}</span><small>{group.items.length}</small></div>
                {group.items.map(destination => {
                  const isSelected = String(destination.id) === value;
                  const total = destination.total_registros ?? destination.total_avisos ?? 0;
                  return (
                    <button type="button" role="option" aria-selected={isSelected} className={`${styles.destinationOption} ${isSelected ? styles.selected : ''}`} key={destination.id} onClick={() => choose(destination)}>
                      <span className={styles.destinationIcon}><MapPin aria-hidden="true" /></span>
                      <span className={styles.destinationCopy}><strong>{destination.zona || destination.nombre_lote}</strong><small>MYG-{destination.id} · {total} {total === 1 ? 'registro' : 'registros'}</small></span>
                      <span className={styles.destinationStatus}><i />{destination.estado || 'Pendiente'}</span>
                      <Check className={styles.destinationCheck} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            )) : <p className={styles.destinationEmpty}>No encontramos rutas con ese criterio.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
