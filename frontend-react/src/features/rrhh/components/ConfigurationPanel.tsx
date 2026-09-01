import { useState } from 'react';
import {
  CalendarDays, CalendarRange, Clock3, Pencil, Plus, Power, Utensils,
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
import { formatDurationReadable, formatScheduleRange, formatScheduleTime } from './attendance-formatters';
import { GeofenceManager } from './GeofenceManager';
import { JobRoleManager } from './JobRoleManager';

type Props = {
  view: 'schedules' | 'settings';
  siteId: number;
  sites: Site[];
  roles: JobRole[];
  schedules: WorkSchedule[];
  geofences: Geofence[];
  canManage: boolean;
  onSiteChange: (siteId: number) => void;
  onCatalogChanged: () => Promise<void>;
};

type PlannerSection = 'CARGOS' | 'JORNADAS' | 'SEMANA' | 'CALENDARIO';

function formatScheduleDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date).replace('.', '');
}

export function ConfigurationPanel({ view, siteId, sites, roles, schedules, geofences, canManage, onSiteChange, onCatalogChanged }: Props) {
  const [scheduleEditor, setScheduleEditor] = useState<WorkSchedule | 'new' | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [plannerSection, setPlannerSection] = useState<PlannerSection>('JORNADAS');

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

  return <div className={view === 'settings' ? styles.settingsWorkspace : styles.configGrid}>
    {view === 'settings' && <>
      <GeofenceManager siteId={siteId} sites={sites} geofences={geofences} canManage={canManage} onSiteChange={onSiteChange} onCatalogChanged={onCatalogChanged} />
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
        <button type="button" className={plannerSection === 'CARGOS' ? scheduleStyles.plannerNavActive : ''} aria-current={plannerSection === 'CARGOS' ? 'page' : undefined} onClick={() => setPlannerSection('CARGOS')}>
          Cargos y funciones
        </button>
      </nav>

      <div className={scheduleStyles.workspaceContent}>
        {plannerSection === 'CARGOS' && <JobRoleManager roles={roles} canManage={canManage} onCatalogChanged={onCatalogChanged} />}
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
              <div className={scheduleStyles.scheduleLunch}><Utensils /><span>{item.lunch_enabled ? <><strong>{formatScheduleTime(item.lunch_start_from)} – {formatScheduleTime(item.lunch_start_until)}</strong><small>Duración: {formatDurationReadable(item.lunch_duration_minutes)}</small></> : <><strong>Sin control de almuerzo</strong><small>No aplica</small></>}</span></div>
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
