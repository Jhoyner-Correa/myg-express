import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BriefcaseBusiness, KeyRound, MapPin, Pencil, Search, UserCheck, UserPlus, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import { PageLoader } from '../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../core/api/errors';
import { useAuth } from '../../core/auth/authState';
import { PERMISSIONS, userHasPermission } from '../../core/auth/permissions';
import { showToast } from '../../core/utils/toast';
import { AbsencePanel } from './components/AbsencePanel';
import { ActivationModal } from './components/ActivationModal';
import { AttendancePanel } from './components/AttendancePanel';
import { AttendanceReportsPanel } from './components/AttendanceReportsPanel';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { EmployeeModal } from './components/EmployeeModal';
import { RrhhOverview } from './components/RrhhOverview';
import { rrhhService } from './rrhh.service';
import type { Employee, EmployeeInput, RrhhCatalogs, ScheduleAssignment } from './types';
import styles from './Rrhh.module.css';

const emptyCatalogs: RrhhCatalogs = { sites: [], roles: [], schedules: [] };

export type RrhhSection = 'overview' | 'people' | 'attendance' | 'requests' | 'schedules' | 'reports' | 'configuration';

const SECTION_META: Record<RrhhSection, { title: string; subtitle: string }> = {
  overview: { title: 'Resumen de Recursos Humanos', subtitle: 'Indicadores corporativos y prioridades operativas' },
  people: { title: 'Personal', subtitle: 'Directorio, cargos y acceso móvil de colaboradores' },
  attendance: { title: 'Asistencia', subtitle: 'Marcaciones y cumplimiento de jornada' },
  requests: { title: 'Solicitudes', subtitle: 'Permisos, vacaciones y decisiones administrativas' },
  schedules: { title: 'Horarios y calendario', subtitle: 'Jornadas, semana laboral y días especiales' },
  reports: { title: 'Reportes', subtitle: 'Consolidados operativos y exportación de asistencia' },
  configuration: { title: 'Configuración de RR. HH.', subtitle: 'Cargos y parámetros operativos por sede' },
};

export function Rrhh({ section }: { section: RrhhSection }) {
  const { user } = useAuth();
  const canManage = userHasPermission(user, PERMISSIONS.RRHH_MANAGE);
  const canConfigure = userHasPermission(user, PERMISSIONS.RRHH_CONFIGURE);
  const canViewAllSites = user?.alcance !== 'SEDE';
  const [catalogs, setCatalogs] = useState<RrhhCatalogs>(emptyCatalogs);
  const [siteId, setSiteId] = useState<number | null>(user?.sede_id ?? null);
  const [configurationSiteId, setConfigurationSiteId] = useState<number | null>(user?.sede_id ?? null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [activating, setActivating] = useState<Employee | null>(null);

  useEffect(() => {
    if (user?.alcance === 'SEDE' && user.sede_id) {
      setSiteId(user.sede_id);
      setConfigurationSiteId(user.sede_id);
    }
  }, [user?.alcance, user?.sede_id]);

  const loadCatalogs = useCallback(async (signal?: AbortSignal) => {
    const data = await rrhhService.getCatalogs(signal);
    setCatalogs(data);
    setConfigurationSiteId(current => current ?? data.sites[0]?.id ?? null);
  }, []);

  const loadEmployees = useCallback(async (selectedSiteId: number | null, signal?: AbortSignal) => {
    setEmployees(await rrhhService.listEmployees(selectedSiteId, signal));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void loadCatalogs(controller.signal).catch(loadError => {
      if (!axios.isCancel(loadError)) setError(loadError);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadCatalogs]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void loadEmployees(siteId, controller.signal).catch(loadError => {
      if (!axios.isCancel(loadError)) setError(loadError);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadEmployees, siteId]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('es');
    if (!term) return employees;
    return employees.filter(employee => `${employee.nombres} ${employee.apellidos} ${employee.dni} ${employee.codigoEmpleado} ${employee.cargoNombre ?? ''} ${employee.sedeNombre ?? ''}`.toLocaleLowerCase('es').includes(term));
  }, [employees, query]);
  const activeCount = employees.filter(employee => employee.estado === 'ACTIVO').length;
  const trackedCount = employees.filter(employee => employee.tipoRastreo === 'CONTINUO').length;
  const selectedSite = catalogs.sites.find(site => site.id === siteId);

  const reload = useCallback(async () => { await loadEmployees(siteId); }, [loadEmployees, siteId]);

  const saveEmployee = async (input: EmployeeInput, assignments: ScheduleAssignment[], effectiveFrom: string) => {
    const currentEmployee = editing === 'new' ? null : editing;
    const saved = currentEmployee ? await rrhhService.updateEmployee(currentEmployee.id, input) : await rrhhService.createEmployee(input);
    try { await rrhhService.saveEmployeeSchedule(saved.id, assignments, effectiveFrom); }
    catch (scheduleError) { showToast(getApiErrorMessage(scheduleError, 'El colaborador se guardó, pero debes revisar su horario.'), 'warning'); }
    await reload(); setEditing(null);
    showToast(currentEmployee ? 'Información del colaborador actualizada.' : 'Colaborador registrado correctamente.', 'success');
  };

  const renderContent = () => {
    if (loading && catalogs.sites.length === 0) return <PageLoader label="Preparando Recursos Humanos" />;
    if (error) return <div className={styles.errorState} role="alert"><p>{getApiErrorMessage(error, 'No se pudo cargar Recursos Humanos.')}</p><Button variant="secondary" onClick={() => void loadCatalogs()}>Reintentar</Button></div>;
    if (catalogs.sites.length === 0) return <div className={styles.errorState}>No hay sedes disponibles dentro de tu alcance.</div>;
    if ((section === 'configuration' || section === 'schedules') && configurationSiteId !== null) return <ConfigurationPanel view={section === 'schedules' ? 'schedules' : 'settings'} siteId={configurationSiteId} sites={catalogs.sites} roles={catalogs.roles} schedules={catalogs.schedules} canManage={canConfigure} onSiteChange={setConfigurationSiteId} onCatalogChanged={() => loadCatalogs()} />;
    if (section === 'overview') return <RrhhOverview siteId={siteId} employees={employees} />;
    if (section === 'attendance') return <AttendancePanel siteId={siteId} canManage={canManage} />;
    if (section === 'requests') return <AbsencePanel siteId={siteId} employees={employees} canManage={canManage} />;
    if (section === 'reports') return <AttendanceReportsPanel siteId={siteId} />;

    return <>
      <div className={styles.metrics}>
        <article><span className={styles.metricBlue}><Users /></span><div><p>Personal registrado</p><strong>{employees.length}</strong><small>{selectedSite ? `En ${selectedSite.name}` : 'En toda la empresa'}</small></div></article>
        <article><span className={styles.metricGreen}><UserCheck /></span><div><p>Colaboradores activos</p><strong>{activeCount}</strong><small>{employees.length ? Math.round(activeCount / employees.length * 100) : 0}% del personal</small></div></article>
        <article><span className={styles.metricOrange}><BriefcaseBusiness /></span><div><p>Repartidores monitoreados</p><strong>{trackedCount}</strong><small>Con seguimiento continuo</small></div></article>
      </div>
      <article className={styles.card}>
        <header className={styles.toolbar}><div><h2>Directorio de personal</h2><p>Gestiona los datos laborales y accesos a la aplicación móvil.</p></div><div className={styles.toolbarActions}><label className={styles.search}><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar colaborador..." /></label></div></header>
        {loading ? <PageLoader compact label="Actualizando personal" /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Colaborador</th><th>Sede</th><th>Documento</th><th>Cargo</th><th>Seguimiento</th><th>Estado</th><th aria-label="Acciones" /></tr></thead><tbody>
          {filtered.map(employee => <tr key={employee.id}><td><div className={styles.person}><span>{employee.nombres.charAt(0)}{employee.apellidos.charAt(0)}</span><div><strong>{employee.nombres} {employee.apellidos}</strong><small>{employee.codigoEmpleado}</small></div></div></td><td>{employee.sedeNombre || selectedSite?.name || 'Sin sede'}</td><td>{employee.dni}</td><td>{employee.cargoNombre || 'Sin cargo'}</td><td>{employee.tipoRastreo === 'CONTINUO' ? 'Continuo' : employee.tipoRastreo === 'NINGUNO' ? 'Sin rastreo' : 'Solo marcación'}</td><td><span className={`${styles.status} ${styles[`status${employee.estado}`]}`}><i />{employee.estado === 'ACTIVO' ? 'Activo' : employee.estado === 'INACTIVO' ? 'Inactivo' : 'Suspendido'}</span></td><td><div className={styles.actions}>{canManage && <><button title="Editar colaborador" aria-label={`Editar a ${employee.nombres}`} onClick={() => setEditing(employee)}><Pencil /></button><button title="Generar acceso móvil" aria-label={`Generar acceso para ${employee.nombres}`} onClick={() => setActivating(employee)}><KeyRound /></button></>}</div></td></tr>)}
          {!filtered.length && <tr><td colSpan={7}><div className={styles.empty}>{query ? 'No encontramos colaboradores con ese criterio.' : 'Aún no hay colaboradores registrados en este alcance.'}</div></td></tr>}
        </tbody></table></div>}
      </article>
    </>;
  };

  const showScopePicker = section !== 'configuration' && section !== 'schedules';
  return <main className={`main ${styles.page}`} id="main-content">
    <PageHeader icon={<Users />} title={SECTION_META[section].title} subtitle={SECTION_META[section].subtitle} metadata={section === 'configuration' || section === 'schedules' ? 'Alcance empresarial' : selectedSite?.name ?? (canViewAllSites ? 'Todas las sedes' : user?.sede_nombre ?? 'Sede operativa')} />
    <section className={styles.content}>
      <div className={styles.headingRow}>
        <div className={styles.sectionContext}><span>Recursos Humanos</span><strong>{SECTION_META[section].title}</strong></div>
        <div className={styles.headingActions}>
          {showScopePicker && <div className={styles.sitePicker}><MapPin size={15} /><select aria-label="Alcance de sede" value={siteId ?? 'all'} onChange={event => setSiteId(event.target.value === 'all' ? null : Number(event.target.value))}>{canViewAllSites && <option value="all">Todas las sedes</option>}{catalogs.sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div>}
          {canManage && section === 'people' && <Button icon={<UserPlus size={16} />} onClick={() => setEditing('new')}>Registrar colaborador</Button>}
        </div>
      </div>
      {renderContent()}
    </section>
    <EmployeeModal open={editing !== null} siteId={siteId} employee={editing === 'new' ? null : editing} sites={catalogs.sites} roles={catalogs.roles} schedules={catalogs.schedules} onClose={() => setEditing(null)} onSave={saveEmployee} />
    <ActivationModal employee={activating} onClose={() => setActivating(null)} />
  </main>;
}
