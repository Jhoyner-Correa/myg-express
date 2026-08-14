import { useEffect, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, Clock3, MapPinned, Pencil, Plus, Power } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { Geofence, JobRole, SchedulePolicyInput, Site, WorkSchedule } from '../types';
import styles from '../Rrhh.module.css';
import { ScheduleEditorModal } from './ScheduleEditorModal';
import { WorkCalendarManager } from './WorkCalendarManager';

type Props = {
  siteId: number;
  sites: Site[];
  roles: JobRole[];
  schedules: WorkSchedule[];
  canManage: boolean;
  onSiteChange: (siteId: number) => void;
  onCatalogChanged: () => Promise<void>;
};
const emptyGeofence = { latitude: '', longitude: '', radius_meters: '50', maximum_accuracy_meters: '30' };

function time(value: string | null) { return value ? value.slice(0, 5) : '—'; }

export function ConfigurationPanel({ siteId, sites, roles, schedules, canManage, onSiteChange, onCatalogChanged }: Props) {
  const [geofence, setGeofence] = useState(emptyGeofence);
  const [role, setRole] = useState({ name: '', description: '', default_tracking_type: 'SOLO_MARCACION' as JobRole['default_tracking_type'] });
  const [scheduleEditor, setScheduleEditor] = useState<WorkSchedule | 'new' | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void rrhhService.getGeofence(siteId, controller.signal).then((value: Geofence | null) => {
      setGeofence(value ? {
        latitude: String(value.latitude), longitude: String(value.longitude), radius_meters: String(value.radius_meters),
        maximum_accuracy_meters: String(value.maximum_accuracy_meters),
      } : emptyGeofence);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [siteId]);

  const saveGeofence = async (event: FormEvent) => {
    event.preventDefault(); setSaving('geofence');
    try {
      await rrhhService.saveGeofence(siteId, {
        latitude: Number(geofence.latitude), longitude: Number(geofence.longitude), radius_meters: Number(geofence.radius_meters),
        maximum_accuracy_meters: Number(geofence.maximum_accuracy_meters),
      });
      showToast('Geocerca operativa actualizada.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo guardar la geocerca.'), 'error'); }
    finally { setSaving(null); }
  };

  const createRole = async (event: FormEvent) => {
    event.preventDefault(); setSaving('role');
    try { await rrhhService.createJobRole(role); setRole({ name: '', description: '', default_tracking_type: 'SOLO_MARCACION' }); await onCatalogChanged(); showToast('Cargo creado.', 'success'); }
    catch (error) { showToast(getApiErrorMessage(error, 'No se pudo crear el cargo.'), 'error'); }
    finally { setSaving(null); }
  };

  const saveSchedule = async (input: SchedulePolicyInput) => {
    setSaving('schedule');
    try {
      if (scheduleEditor === 'new') await rrhhService.createSchedule(input);
      else if (scheduleEditor) await rrhhService.updateSchedule(scheduleEditor.id, input);
      await onCatalogChanged();
      setScheduleEditor(null);
      showToast(scheduleEditor === 'new' ? 'Horario creado correctamente.' : 'Nueva versión del horario guardada.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo guardar el horario.'), 'error'); }
    finally { setSaving(null); }
  };

  const toggleSchedule = async (schedule: WorkSchedule) => {
    const status = schedule.status === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
    setSaving(`status-${schedule.id}`);
    try {
      await rrhhService.setScheduleStatus(schedule.id, status);
      await onCatalogChanged();
      showToast(`Horario ${status === 'ACTIVO' ? 'activado' : 'desactivado'}.`, 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo cambiar el estado del horario.'), 'error'); }
    finally { setSaving(null); }
  };

  return <div className={styles.configGrid}>
    <section className={styles.configCard}><header><span><MapPinned /></span><div><h2>Geocerca de asistencia</h2><p>Parámetro físico independiente para cada local.</p></div><label className={styles.configSitePicker}><small>Sede</small><select aria-label="Sede de la geocerca" value={siteId} onChange={event => onSiteChange(Number(event.target.value))}>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label></header>
      <form className={styles.compactForm} onSubmit={saveGeofence}>
        <label>Latitud<input type="number" step="any" value={geofence.latitude} onChange={e => setGeofence(current => ({ ...current, latitude: e.target.value }))} placeholder="-11.056..." disabled={!canManage} /></label>
        <label>Longitud<input type="number" step="any" value={geofence.longitude} onChange={e => setGeofence(current => ({ ...current, longitude: e.target.value }))} placeholder="-75.327..." disabled={!canManage} /></label>
        <label>Radio permitido (m)<input type="number" min="10" max="2000" value={geofence.radius_meters} onChange={e => setGeofence(current => ({ ...current, radius_meters: e.target.value }))} disabled={!canManage} /></label>
        <label>Precisión GPS máxima (m)<input type="number" min="5" max="500" value={geofence.maximum_accuracy_meters} onChange={e => setGeofence(current => ({ ...current, maximum_accuracy_meters: e.target.value }))} disabled={!canManage} /></label>
        {canManage && <Button loading={saving === 'geofence'}>Guardar geocerca</Button>}
      </form>
    </section>

    <section className={styles.configCard}><header><span><BriefcaseBusiness /></span><div><h2>Cargos de la empresa</h2><p>{roles.length} perfiles globales disponibles para todas las sedes.</p></div></header>
      <div className={styles.catalogList}>{roles.map(item => <div key={item.id}><strong>{item.name}</strong><span>{item.default_tracking_type === 'CONTINUO' ? 'Rastreo continuo' : item.default_tracking_type === 'NINGUNO' ? 'Sin rastreo' : 'Solo marcación'}</span></div>)}</div>
      {canManage && <form className={styles.inlineCreator} onSubmit={createRole}><input aria-label="Nombre del cargo" value={role.name} onChange={e => setRole(current => ({ ...current, name: e.target.value }))} placeholder="Nuevo cargo" /><select aria-label="Rastreo por defecto" value={role.default_tracking_type} onChange={e => setRole(current => ({ ...current, default_tracking_type: e.target.value as JobRole['default_tracking_type'] }))}><option value="SOLO_MARCACION">Solo marcación</option><option value="CONTINUO">Rastreo continuo</option><option value="NINGUNO">Sin rastreo</option></select><Button size="sm" icon={<Plus size={15} />} loading={saving === 'role'}>Agregar</Button></form>}
    </section>

    <section className={`${styles.configCard} ${styles.scheduleManager}`}>
      <header><span><Clock3 /></span><div><h2>Jornadas de la empresa</h2><p>Políticas globales, versionadas y asignables a cualquier sede.</p></div>{canManage && <Button size="sm" icon={<Plus size={15} />} onClick={() => setScheduleEditor('new')}>Nuevo horario</Button>}</header>
      <div className={styles.scheduleList}>
        {schedules.map(item => <article key={item.id} className={item.status === 'INACTIVO' ? styles.scheduleInactive : ''}>
          <div>
            <div className={styles.scheduleName}><strong>{item.name}</strong><span><i />{item.status === 'ACTIVO' ? 'Activo' : 'Inactivo'}</span></div>
            <p>{time(item.start_time)} – {time(item.end_time)} <b>·</b> tolerancia {item.tolerance_minutes} min</p>
            <small>{item.lunch_enabled ? `Almuerzo ${time(item.lunch_start_from)}–${time(item.lunch_start_until)} · ${item.lunch_duration_minutes} min` : 'Sin marcaciones de almuerzo'}</small>
          </div>
          <div className={styles.scheduleValidity}><span>Versión {item.version}</span><small>Vigente desde {item.effective_from}</small></div>
          {canManage && <div className={styles.scheduleActions}>
            <button type="button" title="Crear una nueva versión" aria-label={`Editar ${item.name}`} onClick={() => setScheduleEditor(item)}><Pencil /></button>
            <button type="button" disabled={saving === `status-${item.id}`} title={item.status === 'ACTIVO' ? 'Desactivar horario' : 'Activar horario'} aria-label={`${item.status === 'ACTIVO' ? 'Desactivar' : 'Activar'} ${item.name}`} onClick={() => void toggleSchedule(item)}><Power /></button>
          </div>}
        </article>)}
        {!schedules.length && <div className={styles.smallEmpty}>Aún no hay jornadas configuradas.</div>}
      </div>
    </section>

    <WorkCalendarManager siteId={siteId} sites={sites} schedules={schedules} canManage={canManage} />

    <ScheduleEditorModal schedule={scheduleEditor} saving={saving === 'schedule'} onClose={() => setScheduleEditor(null)} onSave={saveSchedule} />
  </div>;
}
