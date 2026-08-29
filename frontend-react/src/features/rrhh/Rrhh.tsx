import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CalendarClock, MapPin, User, Users, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button/Button';
import { PageHeader } from '../../components/ui/PageHeader/PageHeader';
import { PageLoader } from '../../components/ui/PageLoader/PageLoader';
import { getApiErrorMessage } from '../../core/api/errors';
import { useAuth } from '../../core/auth/authState';
import { PERMISSIONS, userHasPermission } from '../../core/auth/permissions';
import { deleteProfilePhoto, updateProfile, updateProfilePhoto, type ProfileUpdateInput } from '../../core/auth/profile.service';
import { showToast } from '../../core/utils/toast';
import { ProfileModal } from '../../components/ui/ProfileModal/ProfileModal';
import { AbsencePanel } from './components/AbsencePanel';
import { ActivationModal } from './components/ActivationModal';
import { AttendancePanel } from './components/AttendancePanel';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { EmployeeModal } from './components/EmployeeModal';
import { PersonnelDirectory } from './components/PersonnelDirectory';
import { PaymentsPanel } from './components/PaymentsPanel';
import { RrhhExecutiveHeader } from './components/RrhhExecutiveHeader';
import { RrhhOverview } from './components/RrhhOverview';
import type { ExecutiveAlert } from './components/executive-alerts';
import { rrhhService } from './rrhh.service';
import type { Employee, EmployeeInput, RrhhCatalogs, ScheduleAssignment } from './types';
import styles from './Rrhh.module.css';

const emptyCatalogs: RrhhCatalogs = { sites: [], roles: [], schedules: [] };

function businessMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).format(new Date());
}

function businessDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function dateInMonth(currentDate: string, month: string) {
  const requestedDay = Number(currentDate.slice(8, 10));
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const candidate = `${month}-${String(Math.min(requestedDay, lastDay)).padStart(2, '0')}`;
  return candidate > businessDate() ? businessDate() : candidate;
}

function getOverviewTitle(name?: string) {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    hour12: false,
  }).format(new Date()));
  const greeting = hour < 12 ? '¡Buenos días' : hour < 19 ? '¡Buenas tardes' : '¡Buenas noches';
  const firstName = name ? name.trim().split(/\s+/)[0] : '';
  const formattedName = firstName ? firstName.charAt(0).toLocaleUpperCase('es') + firstName.slice(1).toLocaleLowerCase('es') : '';
  return formattedName ? `${greeting}, ${formattedName}!` : `${greeting}!`;
}

function monthOptions(centerMonth: string, selectedMonth?: string) {
  const center = new Date(`${centerMonth}-01T12:00:00Z`);
  const options = Array.from({ length: 61 }, (_, index) => {
    const value = new Date(center);
    value.setUTCMonth(value.getUTCMonth() + index - 48);
    const key = value.toISOString().slice(0, 7);
    const label = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(value);
    return { key, label: label.charAt(0).toLocaleUpperCase('es') + label.slice(1) };
  });
  if (selectedMonth && !options.some(option => option.key === selectedMonth)) {
    const value = new Date(`${selectedMonth}-01T12:00:00Z`);
    const label = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(value);
    options.push({ key: selectedMonth, label: label.charAt(0).toLocaleUpperCase('es') + label.slice(1) });
  }
  return options.sort((left, right) => right.key.localeCompare(left.key));
}

export type RrhhSection = 'overview' | 'people' | 'attendance' | 'requests' | 'schedules' | 'payments' | 'configuration';

const SECTION_META: Record<RrhhSection, { title: string; subtitle: string }> = {
  overview: { title: 'Resumen de Recursos Humanos', subtitle: 'Aquí tienes el resumen de Recursos Humanos de hoy' },
  people: { title: 'Personal', subtitle: 'Directorio, cargos y acceso móvil de colaboradores' },
  attendance: { title: 'Asistencia', subtitle: 'Marcaciones y cumplimiento de jornada' },
  requests: { title: 'Solicitudes', subtitle: 'Permisos, vacaciones y decisiones administrativas' },
  schedules: { title: 'Horarios y calendario', subtitle: 'Jornadas, semana laboral y días especiales' },
  payments: { title: 'Pagos mensuales', subtitle: 'Honorarios, horas extras y depósitos bancarios' },
  configuration: { title: 'Configuración de RR. HH.', subtitle: 'Cargos y parámetros operativos por sede' },
};

export function Rrhh({ section }: { section: RrhhSection }) {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
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
  const [overviewMonth, setOverviewMonth] = useState(businessMonth);
  const [attendanceDate, setAttendanceDate] = useState(businessDate);
  const [overviewAlerts, setOverviewAlerts] = useState<ExecutiveAlert[]>([]);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [activating, setActivating] = useState<Employee | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const saveProfile = async (input: ProfileUpdateInput) => {
    const updatedUser = await updateProfile(input);
    updateUser?.(updatedUser);
    return updatedUser;
  };
  const saveProfilePhoto = async (file: File) => {
    const updatedUser = await updateProfilePhoto(file);
    updateUser?.(updatedUser);
    return updatedUser;
  };
  const removeProfilePhoto = async () => {
    const updatedUser = await deleteProfilePhoto();
    updateUser?.(updatedUser);
    return updatedUser;
  };
  const overviewMonths = useMemo(() => monthOptions(businessMonth(), overviewMonth), [overviewMonth]);

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
    if (section === 'overview') return <RrhhOverview siteId={siteId} employees={employees} query={query} agendaMonth={overviewMonth} onAgendaMonthChange={setOverviewMonth} onAlertsChange={setOverviewAlerts} />;
    if (section === 'attendance') return <AttendancePanel siteId={siteId} sites={catalogs.sites} canViewAllSites={canViewAllSites} canManage={canManage} employees={employees} date={attendanceDate} onSiteChange={setSiteId} onDateChange={setAttendanceDate} />;
    if (section === 'requests') return <AbsencePanel
      siteId={siteId}
      sites={catalogs.sites}
      employees={employees}
      canManage={canManage}
      canViewAllSites={canViewAllSites}
      onSiteChange={setSiteId}
    />;
    if (section === 'payments') return <PaymentsPanel
      month={overviewMonth}
      siteId={siteId}
      sites={catalogs.sites}
      canManage={canManage}
      onSiteChange={setSiteId}
      onMonthChange={setOverviewMonth}
    />;
    return <PersonnelDirectory
      employees={employees}
      sites={catalogs.sites}
      siteId={siteId}
      query={query}
      loading={loading}
      canManage={canManage}
      canViewAllSites={canViewAllSites}
      onQueryChange={setQuery}
      onSiteChange={setSiteId}
      onAdd={() => setEditing('new')}
      onEdit={setEditing}
      onActivate={setActivating}
      onRefresh={reload}
    />;
  };

  const showScopePicker = section !== 'overview' && section !== 'people' && section !== 'configuration' && section !== 'schedules' && section !== 'payments';
  const executiveHeaderMonth = section === 'attendance' ? attendanceDate.slice(0, 7) : overviewMonth;
  const executiveHeaderMonths = section === 'attendance'
    ? overviewMonths.filter(option => option.key <= businessMonth())
    : overviewMonths;
  const executiveHeader = <RrhhExecutiveHeader
    user={user}
    sites={catalogs.sites}
    canViewAllSites={canViewAllSites}
    siteId={siteId}
    month={executiveHeaderMonth}
    months={executiveHeaderMonths}
    query={query}
    alerts={overviewAlerts}
    onSiteChange={setSiteId}
    onMonthChange={month => section === 'attendance' ? setAttendanceDate(current => dateInMonth(current, month)) : setOverviewMonth(month)}
    onQueryChange={setQuery}
    onAlertSelect={target => navigate(target)}
    onAlertsClick={() => {
      if (section !== 'overview') {
        navigate('/rrhh/resumen');
        return;
      }
      document.getElementById('rrhh-attention-required')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }}
    onOpenProfile={() => setProfileModalOpen(true)}
    compact={section !== 'overview' && section !== 'attendance'}
    showSite={section !== 'attendance' && section !== 'payments'}
    showSearch={section !== 'attendance'}
    showPeriod={section !== 'attendance'}
  />;
  return <main className={`main ${styles.page}`} id="main-content">
    <PageHeader
      icon={section === 'overview' ? <User /> : section === 'attendance' ? <CalendarClock /> : section === 'payments' ? <WalletCards /> : <Users />}
      title={section === 'overview' ? getOverviewTitle(user?.nombre) : SECTION_META[section].title}
      subtitle={SECTION_META[section].subtitle}
      metadata={executiveHeader}
      tone={section === 'overview' ? 'corporate' : section === 'people' ? 'blue' : 'brand'}
      size={section === 'people' ? 'large' : 'default'}
    />
    <section className={styles.content}>
      {section !== 'overview' && section !== 'people' && section !== 'attendance' && section !== 'schedules' && section !== 'requests' && section !== 'payments' && <div className={styles.headingRow}>
        <div className={styles.sectionContext}><span>Recursos Humanos</span><strong>{SECTION_META[section].title}</strong></div>
        <div className={styles.headingActions}>
          {showScopePicker && <div className={styles.sitePicker}><MapPin size={15} /><select aria-label="Alcance de sede" value={siteId ?? 'all'} onChange={event => setSiteId(event.target.value === 'all' ? null : Number(event.target.value))}>{canViewAllSites && <option value="all">Todas las sedes</option>}{catalogs.sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div>}
        </div>
      </div>}
      {renderContent()}
    </section>
    <EmployeeModal open={editing !== null} siteId={siteId} employee={editing === 'new' ? null : editing} sites={catalogs.sites} roles={catalogs.roles} schedules={catalogs.schedules} onClose={() => setEditing(null)} onSave={saveEmployee} />
    <ActivationModal employee={activating} onClose={() => setActivating(null)} onChanged={reload} />
    <ProfileModal
      open={profileModalOpen}
      user={user}
      onClose={() => setProfileModalOpen(false)}
      onSave={saveProfile}
      onPhotoUpload={saveProfilePhoto}
      onPhotoDelete={removeProfilePhoto}
    />
  </main>;
}
