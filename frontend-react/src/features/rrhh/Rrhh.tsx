import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BriefcaseBusiness, CalendarCheck2, ClipboardList, KeyRound, MapPin, Pencil, Search, Settings2, UserCheck, UserPlus, Users } from 'lucide-react';
import { Button } from '../../components/ui/Button/Button';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import { PageLoader } from '../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../core/api/errors';
import { useAuth } from '../../core/auth/authState';
import { PERMISSIONS, userHasPermission } from '../../core/auth/permissions';
import { showToast } from '../../core/utils/toast';
import { ActivationModal } from './components/ActivationModal';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { EmployeeModal } from './components/EmployeeModal';
import { AttendancePanel } from './components/AttendancePanel';
import { AbsencePanel } from './components/AbsencePanel';
import { rrhhService } from './rrhh.service';
import type { Employee, EmployeeInput, RrhhCatalogs, ScheduleAssignment } from './types';
import styles from './Rrhh.module.css';

const emptyCatalogs: RrhhCatalogs = { sites: [], roles: [], schedules: [] };

export function Rrhh() {
  const { user } = useAuth();
  const canManage = userHasPermission(user, PERMISSIONS.RRHH_MANAGE);
  const [catalogs, setCatalogs] = useState<RrhhCatalogs>(emptyCatalogs);
  const [siteId, setSiteId] = useState<number | null>(user?.sede_id ?? null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'attendance' | 'requests' | 'people' | 'configuration'>('attendance');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [activating, setActivating] = useState<Employee | null>(null);

  const loadCatalogs = useCallback(async (signal?: AbortSignal) => {
    const data = await rrhhService.getCatalogs(signal);
    setCatalogs(data);
    setSiteId(current => current ?? data.sites[0]?.id ?? null);
  }, []);

  const loadEmployees = useCallback(async (selectedSiteId: number, signal?: AbortSignal) => {
    setEmployees(await rrhhService.listEmployeesByBranch(selectedSiteId, signal));
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
    if (siteId === null) { setEmployees([]); return; }
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
    return employees.filter(employee => `${employee.nombres} ${employee.apellidos} ${employee.dni} ${employee.codigoEmpleado} ${employee.cargoNombre ?? ''}`.toLocaleLowerCase('es').includes(term));
  }, [employees, query]);
  const activeCount = employees.filter(employee => employee.estado === 'ACTIVO').length;
  const trackedCount = employees.filter(employee => employee.tipoRastreo === 'CONTINUO').length;
  const selectedSite = catalogs.sites.find(site => site.id === siteId);

  const reload = useCallback(async () => {
    if (siteId !== null) await loadEmployees(siteId);
  }, [loadEmployees, siteId]);

  const saveEmployee = async (input: EmployeeInput, assignments: ScheduleAssignment[]) => {
    const currentEmployee = editing === 'new' ? null : editing;
    const saved = currentEmployee
      ? await rrhhService.updateEmployee(currentEmployee.id, input)
      : await rrhhService.createEmployee(input);
    try { await rrhhService.saveEmployeeSchedule(saved.id, assignments); }
    catch (scheduleError) { showToast(getApiErrorMessage(scheduleError, 'El colaborador se guardó, pero debes revisar su horario.'), 'warning'); }
    await reload(); setEditing(null);
    showToast(currentEmployee ? 'Información del colaborador actualizada.' : 'Colaborador registrado correctamente.', 'success');
  };

  return (
    <main className={`main ${styles.page}`} id="main-content">
      <PageHeader icon={<Users />} title="Recursos Humanos" subtitle="Personal, asistencia y control operativo por sede" metadata={selectedSite?.name ?? user?.sede_nombre ?? 'Administración general'} />
      <section className={styles.content}>
        <div className={styles.headingRow}>
          <div className={styles.tabs} role="tablist" aria-label="Secciones de Recursos Humanos">
            <button className={tab === 'attendance' ? styles.tabActive : ''} onClick={() => setTab('attendance')}><CalendarCheck2 size={16} />Asistencia</button>
            <button className={tab === 'requests' ? styles.tabActive : ''} onClick={() => setTab('requests')}><ClipboardList size={16} />Solicitudes</button>
            <button className={tab === 'people' ? styles.tabActive : ''} onClick={() => setTab('people')}><Users size={16} />Personal</button>
            <button className={tab === 'configuration' ? styles.tabActive : ''} onClick={() => setTab('configuration')}><Settings2 size={16} />Configuración</button>
          </div>
          <div className={styles.sitePicker}><MapPin size={15} /><select aria-label="Sede operativa" value={siteId ?? ''} onChange={event => setSiteId(Number(event.target.value))}>{catalogs.sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div>
        </div>

        {loading && catalogs.sites.length === 0 ? <PageLoader label="Preparando Recursos Humanos" /> : error ? <div className={styles.errorState} role="alert"><p>{getApiErrorMessage(error, 'No se pudo cargar Recursos Humanos.')}</p><Button variant="secondary" onClick={() => void loadCatalogs()}>Reintentar</Button></div> : siteId === null ? <div className={styles.errorState}>No hay una sede disponible para gestionar.</div> : tab === 'configuration' ? (
          <ConfigurationPanel siteId={siteId} roles={catalogs.roles} schedules={catalogs.schedules} canManage={canManage} onCatalogChanged={() => loadCatalogs()} />
        ) : tab === 'attendance' ? (
          <AttendancePanel siteId={siteId} canManage={canManage} />
        ) : tab === 'requests' ? (
          <AbsencePanel siteId={siteId} employees={employees} canManage={canManage} />
        ) : <>
          <div className={styles.metrics}>
            <article><span className={styles.metricBlue}><Users /></span><div><p>Personal registrado</p><strong>{employees.length}</strong><small>En {selectedSite?.name ?? 'la sede'}</small></div></article>
            <article><span className={styles.metricGreen}><UserCheck /></span><div><p>Colaboradores activos</p><strong>{activeCount}</strong><small>{employees.length ? Math.round(activeCount / employees.length * 100) : 0}% del personal</small></div></article>
            <article><span className={styles.metricOrange}><BriefcaseBusiness /></span><div><p>Repartidores monitoreados</p><strong>{trackedCount}</strong><small>Con seguimiento continuo</small></div></article>
          </div>
          <article className={styles.card}>
            <header className={styles.toolbar}><div><h2>Directorio de personal</h2><p>Gestiona los datos laborales y accesos a la aplicación móvil.</p></div><div className={styles.toolbarActions}><label className={styles.search}><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar colaborador..." /></label>{canManage && <Button icon={<UserPlus size={16} />} onClick={() => setEditing('new')}>Registrar colaborador</Button>}</div></header>
            {loading ? <PageLoader compact label="Actualizando personal" /> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Colaborador</th><th>Documento</th><th>Cargo</th><th>Seguimiento</th><th>Estado</th><th aria-label="Acciones" /></tr></thead><tbody>
              {filtered.map(employee => <tr key={employee.id}><td><div className={styles.person}><span>{employee.nombres.charAt(0)}{employee.apellidos.charAt(0)}</span><div><strong>{employee.nombres} {employee.apellidos}</strong><small>{employee.codigoEmpleado}</small></div></div></td><td>{employee.dni}</td><td>{employee.cargoNombre || 'Sin cargo'}</td><td>{employee.tipoRastreo === 'CONTINUO' ? 'Continuo' : employee.tipoRastreo === 'NINGUNO' ? 'Sin rastreo' : 'Solo marcación'}</td><td><span className={`${styles.status} ${styles[`status${employee.estado}`]}`}><i />{employee.estado === 'ACTIVO' ? 'Activo' : employee.estado === 'INACTIVO' ? 'Inactivo' : 'Suspendido'}</span></td><td><div className={styles.actions}>{canManage && <><button title="Editar colaborador" aria-label={`Editar a ${employee.nombres}`} onClick={() => setEditing(employee)}><Pencil /></button><button title="Generar acceso móvil" aria-label={`Generar acceso para ${employee.nombres}`} onClick={() => setActivating(employee)}><KeyRound /></button></>}</div></td></tr>)}
              {!filtered.length && <tr><td colSpan={6}><div className={styles.empty}>{query ? 'No encontramos colaboradores con ese criterio.' : 'Aún no hay colaboradores registrados en esta sede.'}</div></td></tr>}
            </tbody></table></div>}
          </article>
        </>}
      </section>
      <EmployeeModal open={editing !== null} siteId={siteId ?? 0} employee={editing === 'new' ? null : editing} roles={catalogs.roles} schedules={catalogs.schedules} onClose={() => setEditing(null)} onSave={saveEmployee} />
      <ActivationModal employee={activating} onClose={() => setActivating(null)} />
    </main>
  );
}
