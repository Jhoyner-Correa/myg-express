import { useEffect, useState, type FormEvent } from 'react';
import {
  BriefcaseBusiness, CalendarDays, CalendarRange, Clock3,
  MapPinned, Pencil, Plus, Power, Utensils,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { Geofence, JobRole, SchedulePolicyInput, Site, WorkSchedule } from '../types';
import styles from '../Rrhh.module.css';
import scheduleStyles from './ScheduleConfiguration.module.css';
import { ScheduleEditorModal } from './ScheduleEditorModal';
import { WorkCalendarManager } from './WorkCalendarManager';
import { WeeklyScheduleManager } from './WeeklyScheduleManager';
import { formatScheduleRange, formatScheduleTime } from './attendance-formatters';

type Props = {
  view: 'schedules' | 'settings';
  siteId: number;
  sites: Site[];
  roles: JobRole[];
  schedules: WorkSchedule[];
  canManage: boolean;
  onSiteChange: (siteId: number) => void;
  onCatalogChanged: () => Promise<void>;
};

const emptyGeofence = { latitude: '', longitude: '', radius_meters: '50', maximum_accuracy_meters: '30' };
type PlannerSection = 'JORNADAS' | 'SEMANA' | 'CALENDARIO';

function formatScheduleDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date).replace('.', '');
}

export function ConfigurationPanel({ view, siteId, sites, roles, schedules, canManage, onSiteChange, onCatalogChanged }: Props) {
  const [geofence, setGeofence] = useState(emptyGeofence);
  const [role, setRole] = useState({ name: '', description: '', default_tracking_type: 'SOLO_MARCACION' as JobRole['default_tracking_type'] });
  const [scheduleEditor, setScheduleEditor] = useState<WorkSchedule | 'new' | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [plannerSection, setPlannerSection] = useState<PlannerSection>('JORNADAS');

  useEffect(() => {
    const controller = new AbortController();
    if (view === 'settings') {
      void rrhhService.getGeofence(siteId, controller.signal).then((value: Geofence | null) => {
        setGeofence(value ? { latitude: String(value.latitude), longitude: String(value.longitude), radius_meters: String(value.radius_meters), maximum_accuracy_meters: String(value.maximum_accuracy_meters) } : emptyGeofence);
      }).catch(() => undefined);
    }
    return () => controller.abort();
  }, [siteId, view]);

  const saveGeofence = async (event: FormEvent) => {
    event.preventDefault(); setSaving('geofence');
    try {
      await rrhhService.saveGeofence(siteId, { latitude: Number(geofence.latitude), longitude: Number(geofence.longitude), radius_meters: Number(geofence.radius_meters), maximum_accuracy_meters: Number(geofence.maximum_accuracy_meters) });
      showToast('Geocerca operativa actualizada.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo guardar la geocerca.'), 'error'); }
    finally { setSaving(null); }
  };

  const createRole = async (event: FormEvent) => {
    event.preventDefault(); setSaving('role');
    try {
      await rrhhService.createJobRole(role);
      setRole({ name: '', description: '', default_tracking_type: 'SOLO_MARCACION' });
      await onCatalogChanged();
      showToast('Cargo creado.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo crear el cargo.'), 'error'); }
    finally { setSaving(null); }
  };

  const saveSchedule = async (input: SchedulePolicyInput) => {
    setSaving('schedule');
    try {
      if (scheduleEditor === 'new') await rrhhService.createSchedule(input);
      else if (scheduleEditor) await rrhhService.updateSchedule(scheduleEditor.id, input);
      await onCatalogChanged();
      setScheduleEditor(null);
      showToast(scheduleEditor === 'new' ? 'Jornada creada correctamente.' : 'Nueva versión de la jornada guardada.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo guardar la jornada.'), 'error'); }
    finally { setSaving(null); }
  };

  const toggleSchedule = async (schedule: WorkSchedule) => {
    const status = schedule.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    setSaving(`status-${schedule.id}`);
    try {
      await rrhhService.setScheduleStatus(schedule.id, status);
      await onCatalogChanged();
      showToast(`Jornada ${status === 'ACTIVO' ? 'activada' : 'desactivada'}.`, 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo cambiar el estado de la jornada.'), 'error'); }
    finally { setSaving(null); }
  };

  return <div className={styles.configGrid}>
    {view === 'settings' && <>
      <section className={styles.configCard}><header><span><MapPinned /></span><div><h2>Geocerca de asistencia</h2><p>Parámetro físico independiente para cada local.</p></div><label className={styles.configSitePicker}><small>Sede</small><select aria-label="Sede de la geocerca" value={siteId} onChange={event => onSiteChange(Number(event.target.value))}>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label></header>
        <form className={styles.compactForm} onSubmit={saveGeofence}>
          <label>Latitud<input type="number" step="any" value={geofence.latitude} onChange={event => setGeofence(current => ({ ...current, latitude: event.target.value }))} placeholder="-11.056..." disabled={!canManage} /></label>
          <label>Longitud<input type="number" step="any" value={geofence.longitude} onChange={event => setGeofence(current => ({ ...current, longitude: event.target.value }))} placeholder="-75.327..." disabled={!canManage} /></label>
          <label>Radio permitido (m)<input type="number" min="10" max="2000" value={geofence.radius_meters} onChange={event => setGeofence(current => ({ ...current, radius_meters: event.target.value }))} disabled={!canManage} /></label>
          <label>Precisión GPS máxima (m)<input type="number" min="5" max="500" value={geofence.maximum_accuracy_meters} onChange={event => setGeofence(current => ({ ...current, maximum_accuracy_meters: event.target.value }))} disabled={!canManage} /></label>
          {canManage && <Button loading={saving === 'geofence'}>Guardar geocerca</Button>}
        </form>
      </section>
      <section className={styles.configCard}><header><span><BriefcaseBusiness /></span><div><h2>Cargos de la empresa</h2><p>{roles.length} perfiles globales disponibles para todas las sedes.</p></div></header>
        <div className={styles.catalogList}>{roles.map(item => <div key={item.id}><strong>{item.name}</strong><span>{item.default_tracking_type === 'CONTINUO' ? 'Rastreo continuo' : item.default_tracking_type === 'NINGUNO' ? 'Sin rastreo' : 'Solo marcación'}</span></div>)}</div>
        {canManage && <form className={styles.inlineCreator} onSubmit={createRole}><input aria-label="Nombre del cargo" value={role.name} onChange={event => setRole(current => ({ ...current, name: event.target.value }))} placeholder="Nuevo cargo" /><select aria-label="Rastreo por defecto" value={role.default_tracking_type} onChange={event => setRole(current => ({ ...current, default_tracking_type: event.target.value as JobRole['default_tracking_type'] }))}><option value="SOLO_MARCACION">Solo marcación</option><option value="CONTINUO">Rastreo continuo</option><option value="NINGUNO">Sin rastreo</option></select><Button size="sm" icon={<Plus size={15} />} loading={saving === 'role'}>Agregar</Button></form>}
      </section>
    </>}

    {view === 'schedules' && <section className={scheduleStyles.plannerWorkspace} aria-label="Planificación laboral">
      <nav className={scheduleStyles.plannerNav} aria-label="Secciones de planificación laboral">
        <button type="button" className={plannerSection === 'JORNADAS' ? scheduleStyles.plannerNavActive : ''} aria-current={plannerSection === 'JORNADAS' ? 'page' : undefined} onClick={() => setPlannerSection('JORNADAS')}>
          Jornadas
        </button>
        <button type="button" className={plannerSection === 'SEMANA' ? scheduleStyles.plannerNavActive : ''} aria-current={plannerSection === 'SEMANA' ? 'page' : undefined} onClick={() => setPlannerSection('SEMANA')}>
          Semana laboral
        </button>
        <button type="button" className={plannerSection === 'CALENDARIO' ? scheduleStyles.plannerNavActive : ''} aria-current={plannerSection === 'CALENDARIO' ? 'page' : undefined} onClick={() => setPlannerSection('CALENDARIO')}>
          Días especiales
        </button>
      </nav>

      <div className={scheduleStyles.workspaceContent}>
        {plannerSection === 'JORNADAS' && <section className={scheduleStyles.scheduleRegister}>
          <header className={scheduleStyles.contentHeader}>
            <div><h3>Registro de jornadas</h3><p>Cada jornada puede asignarse a varias sedes y días de la semana.</p></div>
            {canManage && <Button size="sm" icon={<Plus size={15} />} onClick={() => setScheduleEditor('new')}>Nueva jornada</Button>}
          </header>

          <div className={scheduleStyles.scheduleTable} role="table" aria-label="Jornadas configuradas">
            <div className={scheduleStyles.scheduleTableHead} role="row">
              <span>Jornada</span><span>Horario</span><span>Almuerzo</span><span>Vigencia</span><span>Estado</span><span>Acciones</span>
            </div>
            {schedules.map(item => <div key={item.id} className={`${scheduleStyles.scheduleTableRow} ${item.status === 'INACTIVO' ? scheduleStyles.inactiveSchedule : ''}`} role="row">
              <div className={scheduleStyles.scheduleName}><span><CalendarRange /></span><div><strong>{item.name}</strong><small>Jornada operativa</small></div></div>
              <div className={scheduleStyles.scheduleTime}><Clock3 /><span><strong>{formatScheduleRange(item.start_time, item.end_time)}</strong><small>Tolerancia: {item.tolerance_minutes} min</small></span></div>
              <div className={scheduleStyles.scheduleLunch}><Utensils /><span>{item.lunch_enabled ? <><strong>{formatScheduleTime(item.lunch_start_from)} – {formatScheduleTime(item.lunch_start_until)}</strong><small>Duración: {item.lunch_duration_minutes} min</small></> : <><strong>Sin control de almuerzo</strong><small>No aplica</small></>}</span></div>
              <div className={scheduleStyles.scheduleValidity}><CalendarDays /><span><strong>{formatScheduleDate(item.effective_from)}</strong><small>{item.effective_until ? `Hasta ${formatScheduleDate(item.effective_until)}` : 'Sin fecha de término'}</small></span></div>
              <span className={item.status === 'ACTIVO' ? scheduleStyles.activeStatus : scheduleStyles.inactiveStatus}><i />{item.status === 'ACTIVO' ? 'Activa' : 'Inactiva'}</span>
              <div className={scheduleStyles.scheduleActions}>
                {canManage && <>
                  <button
                    type="button"
                    className={`${scheduleStyles.scheduleActionButton} ${scheduleStyles.scheduleEditAction}`}
                    data-tooltip="Editar jornada"
                    aria-label={`Editar ${item.name}`}
                    onClick={() => setScheduleEditor(item)}
                  >
                    <Pencil />
                  </button>
                  <button
                    type="button"
                    className={`${scheduleStyles.scheduleActionButton} ${item.status === 'ACTIVO' ? scheduleStyles.scheduleDeactivateAction : scheduleStyles.scheduleActivateAction}`}
                    data-tooltip={item.status === 'ACTIVO' ? 'Desactivar jornada' : 'Activar jornada'}
                    aria-label={`${item.status === 'ACTIVO' ? 'Desactivar' : 'Activar'} ${item.name}`}
                    disabled={saving === `status-${item.id}`}
                    onClick={() => void toggleSchedule(item)}
                  >
                    <Power />
                  </button>
                </>}
              </div>
            </div>)}
            {!schedules.length && <div className={scheduleStyles.catalogEmpty}><CalendarDays /><strong>No hay jornadas configuradas</strong><span>Crea la primera jornada para definir la semana laboral.</span></div>}
          </div>
        </section>}

        {plannerSection === 'SEMANA' && <WeeklyScheduleManager siteId={siteId} sites={sites} schedules={schedules} canManage={canManage} onSiteChange={onSiteChange} />}
        {plannerSection === 'CALENDARIO' && <WorkCalendarManager siteId={siteId} sites={sites} schedules={schedules} canManage={canManage} onSiteChange={onSiteChange} />}
      </div>
    </section>}

    <ScheduleEditorModal schedule={scheduleEditor} saving={saving === 'schedule'} onClose={() => setScheduleEditor(null)} onSave={saveSchedule} />
  </div>;
}
