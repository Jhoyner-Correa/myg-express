import { useEffect, useState, type FormEvent } from 'react';
import { BriefcaseBusiness, Clock3, MapPinned, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { Geofence, JobRole, WorkSchedule } from '../types';
import styles from '../Rrhh.module.css';

type Props = { siteId: number; roles: JobRole[]; schedules: WorkSchedule[]; canManage: boolean; onCatalogChanged: () => Promise<void> };
const emptyGeofence = { latitude: '', longitude: '', radius_meters: '50', maximum_accuracy_meters: '30' };

export function ConfigurationPanel({ siteId, roles, schedules, canManage, onCatalogChanged }: Props) {
  const [geofence, setGeofence] = useState(emptyGeofence);
  const [role, setRole] = useState({ name: '', description: '', default_tracking_type: 'SOLO_MARCACION' as JobRole['default_tracking_type'] });
  const [schedule, setSchedule] = useState({ name: '', start_time: '09:00', end_time: '18:00', tolerance_minutes: 10 });
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
  const createSchedule = async (event: FormEvent) => {
    event.preventDefault(); setSaving('schedule');
    try { await rrhhService.createSchedule(schedule); setSchedule({ name: '', start_time: '09:00', end_time: '18:00', tolerance_minutes: 10 }); await onCatalogChanged(); showToast('Horario creado.', 'success'); }
    catch (error) { showToast(getApiErrorMessage(error, 'No se pudo crear el horario.'), 'error'); }
    finally { setSaving(null); }
  };

  return <div className={styles.configGrid}>
    <section className={styles.configCard}><header><span><MapPinned /></span><div><h2>Geocerca de asistencia</h2><p>Define el perímetro autorizado para marcar desde la app.</p></div></header>
      <form className={styles.compactForm} onSubmit={saveGeofence}>
        <label>Latitud<input type="number" step="any" value={geofence.latitude} onChange={e => setGeofence(current => ({ ...current, latitude: e.target.value }))} placeholder="-11.056..." disabled={!canManage} /></label>
        <label>Longitud<input type="number" step="any" value={geofence.longitude} onChange={e => setGeofence(current => ({ ...current, longitude: e.target.value }))} placeholder="-75.327..." disabled={!canManage} /></label>
        <label>Radio permitido (m)<input type="number" min="10" max="2000" value={geofence.radius_meters} onChange={e => setGeofence(current => ({ ...current, radius_meters: e.target.value }))} disabled={!canManage} /></label>
        <label>Precisión GPS máxima (m)<input type="number" min="5" max="500" value={geofence.maximum_accuracy_meters} onChange={e => setGeofence(current => ({ ...current, maximum_accuracy_meters: e.target.value }))} disabled={!canManage} /></label>
        {canManage && <Button loading={saving === 'geofence'}>Guardar geocerca</Button>}
      </form>
    </section>
    <section className={styles.configCard}><header><span><BriefcaseBusiness /></span><div><h2>Cargos</h2><p>{roles.length} perfiles laborales configurados.</p></div></header>
      <div className={styles.catalogList}>{roles.map(item => <div key={item.id}><strong>{item.name}</strong><span>{item.default_tracking_type === 'CONTINUO' ? 'Rastreo continuo' : item.default_tracking_type === 'NINGUNO' ? 'Sin rastreo' : 'Solo marcación'}</span></div>)}</div>
      {canManage && <form className={styles.inlineCreator} onSubmit={createRole}><input aria-label="Nombre del cargo" value={role.name} onChange={e => setRole(current => ({ ...current, name: e.target.value }))} placeholder="Nuevo cargo" /><select aria-label="Rastreo por defecto" value={role.default_tracking_type} onChange={e => setRole(current => ({ ...current, default_tracking_type: e.target.value as JobRole['default_tracking_type'] }))}><option value="SOLO_MARCACION">Solo marcación</option><option value="CONTINUO">Rastreo continuo</option><option value="NINGUNO">Sin rastreo</option></select><Button size="sm" icon={<Plus size={15} />} loading={saving === 'role'}>Agregar</Button></form>}
    </section>
    <section className={styles.configCard}><header><span><Clock3 /></span><div><h2>Horarios</h2><p>Jornadas reutilizables para el personal.</p></div></header>
      <div className={styles.catalogList}>{schedules.map(item => <div key={item.id}><strong>{item.name}</strong><span>{item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)} · {item.tolerance_minutes} min</span></div>)}</div>
      {canManage && <form className={styles.scheduleCreator} onSubmit={createSchedule}><input aria-label="Nombre del horario" value={schedule.name} onChange={e => setSchedule(current => ({ ...current, name: e.target.value }))} placeholder="Horario oficina" /><input aria-label="Entrada" type="time" value={schedule.start_time} onChange={e => setSchedule(current => ({ ...current, start_time: e.target.value }))} /><input aria-label="Salida" type="time" value={schedule.end_time} onChange={e => setSchedule(current => ({ ...current, end_time: e.target.value }))} /><input aria-label="Tolerancia" type="number" min="0" max="180" value={schedule.tolerance_minutes} onChange={e => setSchedule(current => ({ ...current, tolerance_minutes: Number(e.target.value) }))} /><Button size="sm" icon={<Plus size={15} />} loading={saving === 'schedule'}>Agregar</Button></form>}
    </section>
  </div>;
}
