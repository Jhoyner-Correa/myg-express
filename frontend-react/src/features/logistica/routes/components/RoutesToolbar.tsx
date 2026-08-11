import { CalendarDays, ChevronDown, ListFilter, Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../../../components/ui/Button/Button';
import styles from './RoutesToolbar.module.css';

export type RouteDateFilter = 'todos' | 'hoy' | 'ayer' | '7d';
export type RouteStatusFilter = 'todos' | 'pendiente' | 'procesando' | 'pausado' | 'completado' | 'cancelado';

type RoutesToolbarProps = {
  search: string;
  dateFilter: RouteDateFilter;
  statusFilter: RouteStatusFilter;
  onSearchChange: (value: string) => void;
  onDateFilterChange: (value: RouteDateFilter) => void;
  onStatusFilterChange: (value: RouteStatusFilter) => void;
  onCreate: () => void;
};

export function RoutesToolbar({
  search,
  dateFilter,
  statusFilter,
  onSearchChange,
  onDateFilterChange,
  onStatusFilterChange,
  onCreate,
}: RoutesToolbarProps) {
  return (
    <section className={styles.toolbar} aria-label="Filtros de rutas">
      <div className={styles.filters}>
        <label className={styles.search}>
          <span className={styles.srOnly}>Buscar rutas</span>
          <Search aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar por ruta, zona o sede"
            value={search}
            onChange={event => onSearchChange(event.target.value)}
          />
        </label>

        <SelectField icon={<CalendarDays />} label="Filtrar por fecha">
          <select
            value={dateFilter}
            onChange={event => onDateFilterChange(event.target.value as RouteDateFilter)}
          >
            <option value="todos">Todas las fechas</option>
            <option value="hoy">Hoy</option>
            <option value="ayer">Ayer</option>
            <option value="7d">Últimos 7 días</option>
          </select>
        </SelectField>

        <SelectField icon={<ListFilter />} label="Filtrar por estado">
          <select
            value={statusFilter}
            onChange={event => onStatusFilterChange(event.target.value as RouteStatusFilter)}
          >
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="procesando">Procesando</option>
            <option value="pausado">Pausado</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </SelectField>
      </div>

      <Button size="sm" icon={<Plus aria-hidden="true" />} onClick={onCreate}>Nueva ruta</Button>
    </section>
  );
}

type SelectFieldProps = {
  icon: ReactNode;
  label: string;
  children: ReactNode;
};

function SelectField({ icon, label, children }: SelectFieldProps) {
  return (
    <label className={styles.selectField}>
      <span className={styles.srOnly}>{label}</span>
      <span className={styles.leadingIcon} aria-hidden="true">{icon}</span>
      {children}
      <ChevronDown className={styles.chevron} aria-hidden="true" />
    </label>
  );
}
