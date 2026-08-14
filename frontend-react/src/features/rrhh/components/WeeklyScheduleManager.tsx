import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarClock, MapPin, RotateCcw } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { WEEKDAYS } from '../domain';
import { rrhhService } from '../rrhh.service';
import type { Site, WeeklySchedulePolicy, WorkSchedule } from '../types';
import styles from '../Rrhh.module.css';

type Props = {
  siteId: number;
  sites: Site[];
  schedules: WorkSchedule[];
  canManage: boolean;
};

type Scope = 'EMPRESA' | 'SEDE';

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function emptyDays(): Record<number, number | null> {
  return Object.fromEntries(WEEKDAYS.map(day => [day.value, null]));
}

export function WeeklyScheduleManager({ siteId, sites, schedules, canManage }: Props) {
  const [scope, setScope] = useState<Scope>('EMPRESA');
  const [policy, setPolicy] = useState<WeeklySchedulePolicy | null>(null);
  const [days, setDays] = useState<Record<number, number | null>>(emptyDays);
  const [effectiveFrom, setEffectiveFrom] = useState(localToday());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const activeSchedules = useMemo(() => schedules.filter(schedule => schedule.status === 'ACTIVO'), [schedules]);
  const selectedSite = sites.find(site => site.id === siteId);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const result = await rrhhService.getWeeklyPolicy(scope, siteId, localToday(), signal);
      const next = emptyDays();
      result.assignments.forEach(assignment => { next[assignment.weekday] = assignment.schedule_id; });
      setPolicy(result);
      setDays(next);
      setEffectiveFrom(localToday());
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [scope, siteId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(error => {
      if (!controller.signal.aborted) showToast(getApiErrorMessage(error, 'No se pudo cargar la semana laboral.'), 'error');
    });
    return () => controller.abort();
  }, [load]);

  const toggleDay = (weekday: number, enabled: boolean) => {
    setDays(current => ({
      ...current,
      [weekday]: enabled ? current[weekday] ?? activeSchedules[0]?.id ?? null : null,
    }));
  };

  const save = async () => {
    const assignments = WEEKDAYS.flatMap(day => days[day.value]
      ? [{ weekday: day.value, schedule_id: Number(days[day.value]) }]
      : []);
    if (!assignments.length) {
      showToast('Selecciona al menos un día laboral.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const result = await rrhhService.saveWeeklyPolicy({
        scope,
        site_id: scope === 'SEDE' ? siteId : null,
        assignments,
        effective_from: effectiveFrom,
      });
      setPolicy(result);
      showToast('Semana laboral programada correctamente.', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo guardar la semana laboral.'), 'error');
    } finally { setSaving(false); }
  };

  const inherit = async () => {
    setSaving(true);
    try {
      const result = await rrhhService.inheritCompanyWeeklyPolicy(siteId, effectiveFrom);
      const next = emptyDays();
      result.assignments.forEach(assignment => { next[assignment.weekday] = assignment.schedule_id; });
      setPolicy(result);
      setDays(next);
      showToast('La sede heredará la semana laboral corporativa.', 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo aplicar la política corporativa.'), 'error');
    } finally { setSaving(false); }
  };

  return <section className={`${styles.configCard} ${styles.weeklyManager}`}>
    <header>
      <span><CalendarClock /></span>
      <div><h2>Semana laboral</h2><p>Define qué días se trabaja y qué jornada corresponde en cada nivel.</p></div>
      <div className={styles.weeklyScope} role="group" aria-label="Alcance de la semana laboral">
        <button type="button" className={scope === 'EMPRESA' ? styles.weeklyScopeActive : ''} onClick={() => setScope('EMPRESA')}><Building2 />Empresa</button>
        <button type="button" className={scope === 'SEDE' ? styles.weeklyScopeActive : ''} onClick={() => setScope('SEDE')}><MapPin />Sede</button>
      </div>
    </header>
    <div className={styles.weeklyContext}>
      <div><strong>{scope === 'EMPRESA' ? 'Política corporativa' : selectedSite?.name ?? 'Sede seleccionada'}</strong>
        <span>{scope === 'SEDE' && policy?.inherited ? 'Actualmente hereda la política corporativa.' : 'Configuración propia vigente.'}</span></div>
      <label>Aplicar cambios desde<input type="date" min={localToday()} value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} disabled={!canManage} /></label>
    </div>
    <div className={styles.weeklyDays} aria-busy={loading}>
      {WEEKDAYS.map(day => {
        const scheduleId = days[day.value];
        return <div key={day.value} className={scheduleId ? styles.weeklyDayEnabled : ''}>
          <label><input type="checkbox" checked={scheduleId !== null} disabled={!canManage || loading || !activeSchedules.length} onChange={event => toggleDay(day.value, event.target.checked)} /><span><strong>{day.label}</strong><small>{scheduleId ? 'Día laborable' : 'Descanso semanal'}</small></span></label>
          <select aria-label={`Jornada de ${day.label}`} value={scheduleId ?? ''} disabled={!canManage || scheduleId === null} onChange={event => setDays(current => ({ ...current, [day.value]: Number(event.target.value) }))}>
            <option value="">Sin jornada</option>
            {activeSchedules.map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.name} · {schedule.start_time.slice(0, 5)}–{schedule.end_time.slice(0, 5)}</option>)}
          </select>
        </div>;
      })}
    </div>
    {!activeSchedules.length && <div className={styles.weeklyWarning}>Crea primero una jornada activa para configurar los días laborables.</div>}
    {canManage && <footer className={styles.weeklyActions}>
      {scope === 'SEDE' && !policy?.inherited && <Button variant="secondary" icon={<RotateCcw size={15} />} loading={saving} onClick={() => void inherit()}>Usar política corporativa</Button>}
      <Button loading={saving} onClick={() => void save()}>{scope === 'EMPRESA' ? 'Guardar política corporativa' : 'Guardar política de sede'}</Button>
    </footer>}
  </section>;
}
