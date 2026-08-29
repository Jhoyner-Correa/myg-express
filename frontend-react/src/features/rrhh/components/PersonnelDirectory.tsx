import { useMemo, useState } from 'react';
import {
  Braces,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  Grid2X2,
  Eye,
  History,
  List,
  MapPin,
  Network,
  Pencil,
  Search,
  ShieldCheck,
  Smartphone,
  Table2,
  UserPlus,
  UserRoundKey,
  UserRoundX,
} from 'lucide-react';
import { PageLoader } from '../../../components/ui/PageLoader/PageLoader';
import { showToast } from '../../../core/utils/toast';
import { exportPersonnelDirectory, type PersonnelExportFormat } from '../reports/personnel-directory-export';
import type { Employee, EmployeeStatus, Site } from '../types';
import { employeePhotoFallbackHandler, getEmployeePhotoUrl } from './employee-avatar';
import {
  EmployeeProfileDrawer,
  type EmployeeProfileOperation,
  type EmployeeProfileTab,
} from './EmployeeProfileDrawer';
import styles from '../Rrhh.module.css';

type Props = {
  employees: Employee[];
  sites: Site[];
  siteId: number | null;
  query: string;
  loading: boolean;
  canManage: boolean;
  canViewAllSites: boolean;
  onQueryChange: (value: string) => void;
  onSiteChange: (value: number | null) => void;
  onAdd: () => void;
  onEdit: (employee: Employee) => void;
  onActivate: (employee: Employee) => void;
  onRefresh: () => Promise<void>;
};

type StatusFilter = 'TODOS' | EmployeeStatus;
type PersonnelView = 'list' | 'directory' | 'orgchart';
type PersonnelSortKey = 'name' | 'site' | 'document' | 'role' | 'tracking' | 'status' | 'mobile';
type PersonnelSort = { key: PersonnelSortKey; direction: 'asc' | 'desc' } | null;

const trackingLabel = {
  NINGUNO: 'Sin rastreo',
  SOLO_MARCACION: 'Solo marcación',
  CONTINUO: 'Continuo',
} as const;

const statusLabel: Record<EmployeeStatus, string> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  SUSPENDIDO: 'Suspendido',
};

const personnelCollator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

function sortValue(employee: Employee, key: PersonnelSortKey): string {
  if (key === 'name') return `${employee.nombres} ${employee.apellidos}`;
  if (key === 'site') return employee.sedeNombre ?? '';
  if (key === 'document') return employee.dni;
  if (key === 'role') return employee.cargoNombre ?? '';
  if (key === 'tracking') return trackingLabel[employee.tipoRastreo];
  if (key === 'status') return statusLabel[employee.estado];
  return employee.accesoMovilActivo ? '1' : '0';
}

export function PersonnelDirectory({
  employees,
  sites,
  siteId,
  query,
  loading,
  canManage,
  canViewAllSites,
  onQueryChange,
  onSiteChange,
  onAdd,
  onEdit,
  onActivate,
  onRefresh,
}: Props) {
  const [status, setStatus] = useState<StatusFilter>('TODOS');
  const [view, setView] = useState<PersonnelView>('list');
  const [sort, setSort] = useState<PersonnelSort>(null);
  const [exporting, setExporting] = useState<PersonnelExportFormat | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [profileTab, setProfileTab] = useState<EmployeeProfileTab>('summary');
  const [profileOperation, setProfileOperation] = useState<EmployeeProfileOperation>(null);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    const result = employees.filter(employee => {
      const searchable = `${employee.nombres} ${employee.apellidos} ${employee.email ?? ''} ${employee.dni} ${employee.ruc ?? ''} ${employee.direccion} ${employee.codigoEmpleado} ${employee.cargoNombre ?? ''} ${employee.sedeNombre ?? ''}`.toLocaleLowerCase('es');
      return (!term || searchable.includes(term)) && (status === 'TODOS' || employee.estado === status);
    });
    if (!sort) return result;
    return [...result].sort((first, second) => {
      const comparison = personnelCollator.compare(sortValue(first, sort.key), sortValue(second, sort.key));
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [employees, query, sort, status]);
  const groupedBySite = useMemo(() => {
    const groups = new Map<string, Employee[]>();
    filtered.forEach(employee => {
      const site = employee.sedeNombre || 'Sin sede asignada';
      groups.set(site, [...(groups.get(site) ?? []), employee]);
    });
    return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second, 'es'));
  }, [filtered]);

  const handleExport = async (format: PersonnelExportFormat) => {
    setExporting(format);
    try {
      await exportPersonnelDirectory(filtered, format);
      showToast(format === 'pdf' ? 'Vista PDF preparada para imprimir o guardar.' : `Directorio exportado en ${format.toUpperCase()} correctamente.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo generar el archivo solicitado.', 'error');
    } finally {
      setExporting(null);
    }
  };

  const openProfile = (
    employee: Employee,
    tab: EmployeeProfileTab = 'summary',
    operation: EmployeeProfileOperation = null,
  ) => {
    setProfileTab(tab);
    setProfileOperation(operation);
    setSelectedEmployee(employee);
  };

  const employeeActions = (employee: Employee) => <div className={styles.personnelActions}>
    <button type="button" className={styles.personnelActionView} data-tooltip="Ver perfil completo" aria-label={`Ver perfil de ${employee.nombres}`} onClick={() => openProfile(employee)}><Eye /></button>
    {canManage && <button type="button" className={styles.personnelActionAccess} data-tooltip={employee.accesoMovilActivo ? 'Administrar acceso activo' : 'Generar acceso móvil'} aria-label={`${employee.accesoMovilActivo ? 'Administrar' : 'Generar'} acceso móvil de ${employee.nombres}`} onClick={() => onActivate(employee)}><UserRoundKey /></button>}
    <button type="button" className={styles.personnelActionActivity} data-tooltip="Consultar actividad" aria-label={`Consultar actividad de ${employee.nombres}`} onClick={() => openProfile(employee, 'activity')}><History /></button>
    {canManage && <button type="button" className={styles.personnelActionStatus} data-tooltip="Cambiar estado laboral" aria-label={`Cambiar estado laboral de ${employee.nombres}`} onClick={() => openProfile(employee, 'summary', 'status')}><ShieldCheck /></button>}
    {canManage && <button type="button" className={styles.personnelActionEdit} data-tooltip="Editar datos y horario" aria-label={`Editar a ${employee.nombres}`} onClick={() => onEdit(employee)}><Pencil /></button>}
  </div>;

  const changeSort = (key: PersonnelSortKey) => {
    setSort(current => current?.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' });
  };

  const sortableHeader = (key: PersonnelSortKey, label: string, className?: string) => {
    const activeDirection = sort?.key === key ? sort.direction : null;
    return <th className={className} aria-sort={activeDirection === 'asc' ? 'ascending' : activeDirection === 'desc' ? 'descending' : 'none'}>
      <button type="button" className={styles.personnelSortButton} onClick={() => changeSort(key)} aria-label={`Ordenar por ${label}`}>
        {label}
        <span className={styles.personnelSortIndicator} aria-hidden="true">
          <ChevronUp className={activeDirection === 'asc' ? styles.personnelSortActive : ''} />
          <ChevronDown className={activeDirection === 'desc' ? styles.personnelSortActive : ''} />
        </span>
      </button>
    </th>;
  };

  return (
    <article className={`${styles.card} ${styles.personnelDirectory}`}>
      <header className={styles.personnelDirectoryHeader}>
        <div className={styles.personnelDirectoryTitle}>
          <div>
            <h2>Directorio de personal</h2>
            <p>{employees.length} {employees.length === 1 ? 'colaborador registrado' : 'colaboradores registrados'}</p>
          </div>
        </div>
        <div className={styles.personnelHeaderControls}>
          <div className={styles.personnelExportBar} role="group" aria-label="Exportar directorio">
            <button type="button" className={styles.exportJsonButton} aria-label="Exportar directorio en JSON" aria-busy={exporting === 'json'} onClick={() => void handleExport('json')} disabled={!filtered.length || exporting !== null}><Braces /><span>{exporting === 'json' ? '…' : 'JSON'}</span></button>
            <button type="button" className={styles.exportPdfButton} aria-label="Exportar directorio en PDF" aria-busy={exporting === 'pdf'} onClick={() => void handleExport('pdf')} disabled={!filtered.length || exporting !== null}><FileText /><span>{exporting === 'pdf' ? '…' : 'PDF'}</span></button>
            <button type="button" className={styles.exportExcelButton} aria-label="Exportar directorio en Excel" aria-busy={exporting === 'xlsx'} onClick={() => void handleExport('xlsx')} disabled={!filtered.length || exporting !== null}><FileSpreadsheet /><span>{exporting === 'xlsx' ? '…' : 'XLSX'}</span></button>
            <button type="button" className={styles.exportCsvButton} aria-label="Exportar directorio en CSV" aria-busy={exporting === 'csv'} onClick={() => void handleExport('csv')} disabled={!filtered.length || exporting !== null}><Table2 /><span>{exporting === 'csv' ? '…' : 'CSV'}</span></button>
          </div>
          <div className={styles.personnelViewSwitcher} role="group" aria-label="Modo de visualización del personal">
            <button type="button" className={view === 'list' ? styles.personnelViewActive : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}><List />Lista</button>
            <button type="button" className={view === 'directory' ? styles.personnelViewActive : ''} aria-pressed={view === 'directory'} onClick={() => setView('directory')}><Grid2X2 />Directorio</button>
            <button type="button" className={view === 'orgchart' ? styles.personnelViewActive : ''} aria-pressed={view === 'orgchart'} onClick={() => setView('orgchart')}><Network />Organigrama</button>
          </div>
          <div className={styles.personnelHeaderActions}>
            {canManage && <button type="button" className={styles.personnelAddButton} onClick={onAdd}><UserPlus />Registrar colaborador</button>}
          </div>
        </div>
      </header>
      <div className={styles.personnelFilters}>
        <label className={styles.personnelSearchField}>
          <span>Buscar</span>
          <div className={styles.personnelSearch}>
            <Search aria-hidden="true" />
            <input value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Buscar colaborador, código, documento o cargo..." />
          </div>
        </label>
        <label className={styles.personnelSelect}>
          <span>Sede</span>
          <select value={siteId ?? 'all'} onChange={event => onSiteChange(event.target.value === 'all' ? null : Number(event.target.value))}>
            {canViewAllSites && <option value="all">Todas las sedes</option>}
            {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <label className={styles.personnelSelect}>
          <span>Estado</span>
          <select value={status} onChange={event => setStatus(event.target.value as StatusFilter)}>
            <option value="TODOS">Todos</option>
            <option value="ACTIVO">Activos</option>
            <option value="SUSPENDIDO">Suspendidos</option>
            <option value="INACTIVO">Inactivos</option>
          </select>
        </label>
      </div>

      {loading ? <PageLoader compact label="Actualizando personal" /> : !filtered.length ? (
        <div className={styles.personnelViewEmpty}>{query || status !== 'TODOS' ? 'No encontramos colaboradores con esos filtros.' : 'Aún no hay colaboradores registrados en este alcance.'}</div>
      ) : view === 'list' ? (
        <div className={`${styles.tableWrap} ${styles.personnelTableWrap}`}>
          <table className={`${styles.table} ${styles.personnelTable}`}>
            <thead><tr>
              {sortableHeader('name', 'Colaborador')}
              {sortableHeader('site', 'Sede')}
              {sortableHeader('document', 'Documento')}
              {sortableHeader('role', 'Cargo')}
              {sortableHeader('tracking', 'Tipo de seguimiento')}
              {sortableHeader('status', 'Estado')}
              {sortableHeader('mobile', 'Acceso móvil', styles.personnelMobileCell)}
              <th className={styles.personnelActionsCell} aria-label="Acciones">Acciones</th>
            </tr></thead>
            <tbody>
              {filtered.map(employee => (
                <tr key={employee.id}>
                  <td><div className={styles.personnelIdentity}><img className={styles.personnelAvatar} src={getEmployeePhotoUrl(employee)} alt={employee.foto ? `Foto de ${employee.nombres} ${employee.apellidos}` : ''} loading="lazy" onError={employeePhotoFallbackHandler(employee)} /><div><strong>{employee.nombres} {employee.apellidos}</strong><small className={styles.personnelCode}>{employee.codigoEmpleado}</small></div></div></td>
                  <td className={styles.personnelSite}><span><MapPin aria-hidden="true" />{employee.sedeNombre || 'Sin sede'}</span></td>
                  <td className={styles.personnelDocument}>{employee.dni}</td>
                  <td>{employee.cargoNombre || 'Sin cargo'}</td>
                  <td><span className={`${styles.trackingBadge} ${styles[`tracking${employee.tipoRastreo}`]}`}>{trackingLabel[employee.tipoRastreo]}</span></td>
                  <td><span className={`${styles.employeeStatus} ${styles[`employeeStatus${employee.estado}`]}`}><i />{statusLabel[employee.estado]}</span></td>
                  <td className={styles.personnelMobileCell}><span className={`${styles.mobileAccess} ${employee.accesoMovilActivo ? styles.mobileAccessActive : ''}`} title={employee.accesoMovilActivo ? 'Aplicación móvil habilitada' : 'Aplicación móvil sin activar'}>{employee.accesoMovilActivo ? <Check /> : <UserRoundX />}</span></td>
                  <td className={styles.personnelActionsCell}>{employeeActions(employee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : view === 'directory' ? (
        <div className={styles.personnelCardGrid}>
          {filtered.map(employee => <article className={styles.personnelCard} key={employee.id}>
            <header>
              <img className={styles.personnelCardAvatar} src={getEmployeePhotoUrl(employee)} alt={employee.foto ? `Foto de ${employee.nombres} ${employee.apellidos}` : ''} loading="lazy" onError={employeePhotoFallbackHandler(employee)} />
              <div><strong>{employee.nombres} {employee.apellidos}</strong><small>{employee.codigoEmpleado}</small></div>
              {employeeActions(employee)}
            </header>
            <dl>
              <div><dt>Sede</dt><dd>{employee.sedeNombre || 'Sin sede'}</dd></div>
              <div><dt>Cargo</dt><dd>{employee.cargoNombre || 'Sin cargo'}</dd></div>
              <div><dt>Documento</dt><dd>{employee.dni}</dd></div>
            </dl>
            <footer>
              <span className={`${styles.employeeStatus} ${styles[`employeeStatus${employee.estado}`]}`}><i />{statusLabel[employee.estado]}</span>
              <span className={`${styles.trackingBadge} ${styles[`tracking${employee.tipoRastreo}`]}`}>{trackingLabel[employee.tipoRastreo]}</span>
              <span className={`${styles.mobileAccessLabel} ${employee.accesoMovilActivo ? styles.mobileAccessLabelActive : ''}`}><Smartphone />{employee.accesoMovilActivo ? 'Móvil activo' : 'Sin activar'}</span>
            </footer>
          </article>)}
        </div>
      ) : (
        <div className={styles.personnelOrgChart}>
          {groupedBySite.map(([site, siteEmployees]) => <section className={styles.personnelOrgBranch} key={site}>
            <header><span><Building2 /></span><div><strong>{site}</strong><small>{siteEmployees.length} {siteEmployees.length === 1 ? 'colaborador' : 'colaboradores'}</small></div></header>
            <div className={styles.personnelOrgEmployees}>
              {siteEmployees.map(employee => <article key={employee.id}>
                <img src={getEmployeePhotoUrl(employee)} alt={employee.foto ? `Foto de ${employee.nombres} ${employee.apellidos}` : ''} loading="lazy" onError={employeePhotoFallbackHandler(employee)} />
                <div><strong>{employee.nombres} {employee.apellidos}</strong><span>{employee.cargoNombre || 'Sin cargo'}</span><small>{employee.codigoEmpleado}</small></div>
                <span className={`${styles.employeeStatus} ${styles[`employeeStatus${employee.estado}`]}`} title={statusLabel[employee.estado]}><i /></span>
                {employeeActions(employee)}
              </article>)}
            </div>
          </section>)}
        </div>
      )}
      <footer className={styles.personnelFooter}><span>{filtered.length} {filtered.length === 1 ? 'colaborador' : 'colaboradores'}</span><small>Directorio actualizado con datos operativos</small></footer>
      <EmployeeProfileDrawer
        employee={selectedEmployee}
        initialTab={profileTab}
        initialOperation={profileOperation}
        canManage={canManage}
        onClose={() => { setSelectedEmployee(null); setProfileOperation(null); }}
        onActivate={target => { setSelectedEmployee(null); onActivate(target); }}
        onChanged={onRefresh}
      />
    </article>
  );
}
