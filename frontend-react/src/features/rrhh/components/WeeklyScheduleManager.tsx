import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, CalendarClock, CheckCircle2, ChevronDown, Info,
  MapPin, RotateCcw, Save, ShieldCheck,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { WEEKDAYS } from '../domain';
import { rrhhService } from '../rrhh.service';
import type { Site, WeeklySchedulePolicy, WorkSchedule } from '../types';
import styles from './ScheduleConfiguration.module.css';
import { formatScheduleRange } from './attendance-formatters';

type Props = {
  siteId: number;
  sites: Site[];
  schedules: WorkSchedule[];
  canManage: boolean;
  onSiteChange: (siteId: number) => void;
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

export function WeeklyScheduleManager({ siteId, sites, schedules, canManage, onSiteChange }: Props) {
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
      showToast('Selecciona al menos un día laborable.', 'warning');
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
      showToast(scope === 'EMPRESA' ? 'Política corporativa programada.' : `Política de ${selectedSite?.name ?? 'la sede'} programada.`, 'success');
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
      showToast(`${selectedSite?.name ?? 'La sede'} usará la política corporativa.`, 'success');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'No se pudo aplicar la política corporativa.'), 'error');
    } finally { setSaving(false); }
  };

  const inherited = scope === 'SEDE' && Boolean(policy?.inherited);

  return <section className={styles.weeklyManager} aria-busy={loading}>
    <header className={styles.weeklyHeader}>
      <div className={styles.weeklyTitle}>
        <span><CalendarClock /></span>
        <div><h2>Configuración semanal</h2><p>Define los días laborables y la jornada que corresponde a cada nivel.</p></div>
      </div>
      <span className={styles.weeklyStatus}><CheckCircle2 />{scope === 'EMPRESA' ? 'Política corporativa' : inherited ? 'Política heredada' : 'Política propia'}</span>
    </header>

    <div className={styles.weeklyBody}>
      <aside className={styles.policySidebar}>
        <div>
          <small className={styles.sidebarLabel}>NIVEL DE CONFIGURACIÓN</small>
          <div className={styles.scopeSwitch} role="group" aria-label="Nivel de la política semanal">
            <button type="button" className={scope === 'EMPRESA' ? styles.scopeActive : ''} onClick={() => setScope('EMPRESA')}><Building2 />Empresa</button>
            <button type="button" className={scope === 'SEDE' ? styles.scopeActive : ''} onClick={() => setScope('SEDE')}><MapPin />Sede</button>
          </div>
        </div>

        {scope === 'SEDE' && <label className={styles.siteControl}>
          <span>Sede a configurar</span>
          <div><MapPin /><select value={siteId} onChange={event => onSiteChange(Number(event.target.value))} disabled={loading}>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select><ChevronDown /></div>
        </label>}

        <div className={styles.contextStatus}>
          <span>{inherited ? <ShieldCheck /> : <CheckCircle2 />}</span>
          <div>
            <strong>{scope === 'EMPRESA' ? 'Base de toda la empresa' : selectedSite?.name ?? 'Sede seleccionada'}</strong>
            <small>{scope === 'EMPRESA' ? 'Se usa cuando una sede no define una semana propia.' : inherited ? 'Esta sede usa actualmente la política corporativa.' : 'Esta sede reemplaza la política corporativa.'}</small>
          </div>
        </div>

        <label className={styles.effectiveControl}>
          <span>Aplicar cambios desde</span>
          <input type="date" min={localToday()} value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} disabled={!canManage || loading} />
        </label>

        <span className={styles.hierarchyNote}><ShieldCheck /><span><strong>Orden de aplicación</strong>Colaborador → sede → empresa</span></span>
      </aside>

      <div className={styles.weekTable} role="table" aria-label="Configuración de la semana laboral">
        <div className={styles.weekTableHead} role="row"><span>Día</span><span>Condición</span><span>Jornada asignada</span></div>
        {WEEKDAYS.map(day => {
          const scheduleId = days[day.value];
          return <div key={day.value} className={`${styles.weekRow} ${scheduleId ? styles.weekRowActive : ''}`} role="row">
            <strong>{day.label}</strong>
            <label className={styles.dayState} aria-label={`${scheduleId ? 'Marcar como descanso' : 'Marcar como laborable'} ${day.label}`}>
              <input type="checkbox" checked={scheduleId !== null} disabled={!canManage || loading || !activeSchedules.length} onChange={event => toggleDay(day.value, event.target.checked)} /><i />
              <span>{scheduleId ? 'Laborable' : 'Descanso'}</span>
            </label>
            <div className={styles.daySchedule}>
              <select aria-label={`Jornada de ${day.label}`} value={scheduleId ?? ''} disabled={!canManage || scheduleId === null} onChange={event => setDays(current => ({ ...current, [day.value]: Number(event.target.value) }))}>
                <option value="">Sin jornada</option>
                {activeSchedules.map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.name} · {formatScheduleRange(schedule.start_time, schedule.end_time)}</option>)}
              </select>
              <ChevronDown />
            </div>
          </div>;
        })}
        {!activeSchedules.length && <div className={styles.weeklyNotice}><Info />Crea o activa una jornada antes de configurar los días laborables.</div>}
      </div>
    </div>

    <footer className={styles.weeklyFooter}>
      <span>Los cambios quedan versionados y se aplican desde la fecha indicada.</span>
      {canManage && <div className={styles.weeklyActions}>
        {scope === 'SEDE' && !inherited && <Button variant="secondary" icon={<RotateCcw size={15} />} loading={saving} onClick={() => void inherit()}>Usar política corporativa</Button>}
        <Button icon={<Save size={15} />} loading={saving} onClick={() => void save()}>{scope === 'EMPRESA' ? 'Guardar política corporativa' : 'Guardar política de sede'}</Button>
      </div>}
    </footer>
  </section>;
}
