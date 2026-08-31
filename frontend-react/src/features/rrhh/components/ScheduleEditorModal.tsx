import { useEffect, useState, type FormEvent } from 'react';
import {
  CalendarClock, CalendarDays, Clock3, Coffee, History,
  Info, ShieldCheck, TimerReset,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import type { SchedulePolicyInput, WorkSchedule } from '../types';
import { formatScheduleRange, formatScheduleTime } from './attendance-formatters';
import styles from './ScheduleEditorModal.module.css';

type Props = {
  schedule: WorkSchedule | 'new' | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: SchedulePolicyInput) => Promise<void>;
};

type ClockPeriod = 'AM' | 'PM';

function normalizeTwelveHourInput(value: string) {
  const clean = value.trim().replace(/\s+/g, '');
  if (!clean) return null;
  let hours: number;
  let minutes: number;
  if (clean.includes(':')) {
    const match = clean.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    hours = Number(match[1]!);
    minutes = Number(match[2]!);
  } else {
    const digits = clean.replace(/\D/g, '');
    if (!digits || digits.length > 4) return null;
    if (digits.length <= 2) {
      hours = Number(digits);
      minutes = 0;
    } else if (digits.length === 3) {
      hours = Number(digits.slice(0, 1));
      minutes = Number(digits.slice(1));
    } else {
      hours = Number(digits.slice(0, 2));
      minutes = Number(digits.slice(2));
    }
  }
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

function toTwentyFourHour(time: string, period: ClockPeriod) {
  const normalized = normalizeTwelveHourInput(time);
  if (!normalized) return null;
  const [hourText, minuteText] = normalized.split(':');
  let hours = Number(hourText);
  if (period === 'AM' && hours === 12) hours = 0;
  if (period === 'PM' && hours !== 12) hours += 12;
  return `${String(hours).padStart(2, '0')}:${minuteText}`;
}

function toTwelveHourDraft(value: string) {
  const [hourText = '0', minuteText = '00'] = value.slice(0, 5).split(':');
  const hours = Number(hourText);
  return {
    time: `${hours % 12 || 12}:${minuteText}`,
    period: (hours >= 12 ? 'PM' : 'AM') as ClockPeriod,
  };
}

function clockMinutes(value: string | null) {
  if (!value) return null;
  const match = value.slice(0, 5).match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]!);
  const minutes = Number(match[2]!);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function lunchDuration(start: string | null, end: string | null) {
  const startMinutes = clockMinutes(start);
  const endMinutes = clockMinutes(end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return 0;
  return endMinutes - startMinutes;
}

function formatDuration(minutes: number) {
  if (minutes <= 0) return 'Duración pendiente';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  if (!remainder) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  return `${hours} ${hours === 1 ? 'hora' : 'horas'} ${remainder} min`;
}

function TwelveHourField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const initial = toTwelveHourDraft(value);
  const [time, setTime] = useState(initial.time);
  const [period, setPeriod] = useState<ClockPeriod>(initial.period);

  useEffect(() => {
    const next = toTwelveHourDraft(value);
    setTime(next.time);
    setPeriod(next.period);
  }, [value]);

  const commit = (nextTime: string, nextPeriod: ClockPeriod) => {
    const normalized = toTwentyFourHour(nextTime, nextPeriod);
    if (normalized) onChange(normalized);
  };

  const normalize = () => {
    const normalized = normalizeTwelveHourInput(time);
    if (normalized) {
      setTime(normalized);
      commit(normalized, period);
      return;
    }
    const current = toTwelveHourDraft(value);
    setTime(current.time);
    setPeriod(current.period);
  };

  return (
    <label>
      <span>{label}</span>
      <div className={styles.twelveHourControl}>
        <Clock3 aria-hidden="true" />
        <input
          aria-label={`${label}: hora`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={5}
          placeholder="9:00"
          value={time}
          onChange={event => {
            const next = event.target.value;
            setTime(next);
            commit(next, period);
          }}
          onBlur={normalize}
        />
        <select
          aria-label={`${label}: periodo`}
          value={period}
          onChange={event => {
            const next = event.target.value as ClockPeriod;
            setPeriod(next);
            commit(time, next);
          }}
        >
          <option value="AM">a. m.</option>
          <option value="PM">p. m.</option>
        </select>
      </div>
    </label>
  );
}

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatPolicyDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(date).replace('.', '');
}

function initialPolicy(schedule: WorkSchedule | 'new' | null): SchedulePolicyInput {
  const lunchStart = schedule && schedule !== 'new' && schedule.lunch_start_from ? schedule.lunch_start_from.slice(0, 5) : '13:00';
  const lunchEnd = schedule && schedule !== 'new' && schedule.lunch_start_until ? schedule.lunch_start_until.slice(0, 5) : '14:00';
  return {
    name: schedule && schedule !== 'new' ? schedule.name : '',
    start_time: schedule && schedule !== 'new' ? schedule.start_time.slice(0, 5) : '09:00',
    end_time: schedule && schedule !== 'new' ? schedule.end_time.slice(0, 5) : '18:00',
    tolerance_minutes: schedule && schedule !== 'new' ? schedule.tolerance_minutes : 10,
    lunch_enabled: schedule && schedule !== 'new' ? schedule.lunch_enabled : true,
    lunch_start_from: lunchStart,
    lunch_start_until: lunchEnd,
    lunch_duration_minutes: lunchDuration(lunchStart, lunchEnd),
    return_tolerance_minutes: schedule && schedule !== 'new' ? schedule.return_tolerance_minutes : 5,
    entry_open_before_minutes: schedule && schedule !== 'new' ? schedule.entry_open_before_minutes : 60,
    lunch_open_before_minutes: schedule && schedule !== 'new' ? schedule.lunch_open_before_minutes : 30,
    return_open_before_minutes: schedule && schedule !== 'new' ? schedule.return_open_before_minutes : 30,
    exit_open_before_minutes: schedule && schedule !== 'new' ? schedule.exit_open_before_minutes : 30,
    overtime_threshold_minutes: schedule && schedule !== 'new' ? schedule.overtime_threshold_minutes : 10,
    effective_from: localToday(),
  };
}

function validMinutes(value: number, minimum: number, maximum: number) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

export function ScheduleEditorModal({ schedule, saving, onClose, onSave }: Props) {
  const [form, setForm] = useState<SchedulePolicyInput>(() => initialPolicy(schedule));
  const [error, setError] = useState<string | null>(null);
  const editing = schedule !== null && schedule !== 'new';

  useEffect(() => {
    if (schedule === null) return;
    setForm(initialPolicy(schedule));
    setError(null);
  }, [schedule]);

  const update = <K extends keyof SchedulePolicyInput>(field: K, value: SchedulePolicyInput[K]) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const updateLunchTime = (field: 'lunch_start_from' | 'lunch_start_until', value: string) => {
    setForm(current => {
      const next = { ...current, [field]: value };
      return {
        ...next,
        lunch_duration_minutes: lunchDuration(next.lunch_start_from, next.lunch_start_until),
      };
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) { setError('Escribe un nombre para identificar esta jornada.'); return; }
    if (!form.effective_from) { setError('Selecciona la fecha desde la que se aplicará la jornada.'); return; }
    if (form.start_time >= form.end_time) { setError('La salida debe ser posterior a la hora de entrada.'); return; }
    if (!validMinutes(form.tolerance_minutes, 0, 180) || !validMinutes(form.entry_open_before_minutes, 0, 180)) {
      setError('Revisa la tolerancia y la apertura anticipada de entrada.'); return;
    }
    if (form.lunch_enabled) {
      if (!form.lunch_start_from || !form.lunch_start_until || form.lunch_start_from >= form.lunch_start_until) {
        setError('Configura correctamente la ventana de salida al almuerzo.'); return;
      }
      if (form.lunch_start_from <= form.start_time || form.lunch_start_until >= form.end_time) {
        setError('El almuerzo debe estar comprendido dentro de la jornada laboral.'); return;
      }
      const calculatedDuration = lunchDuration(form.lunch_start_from, form.lunch_start_until);
      if (!validMinutes(calculatedDuration, 15, 300)
        || !validMinutes(form.return_tolerance_minutes, 0, 120)
        || !validMinutes(form.lunch_open_before_minutes, 0, 120)
        || !validMinutes(form.return_open_before_minutes, 0, 120)) {
        setError('Revisa la duración, tolerancia y ventanas de marcación del almuerzo.'); return;
      }
    }
    if (!validMinutes(form.exit_open_before_minutes, 0, 180)
      || !validMinutes(form.overtime_threshold_minutes, 1, 180)) {
      setError('Revisa la apertura de salida y el umbral de sobretiempo.'); return;
    }

    setError(null);
    const calculatedLunchDuration = form.lunch_enabled
      ? lunchDuration(form.lunch_start_from, form.lunch_start_until)
      : 0;
    await onSave({
      ...form,
      name: form.name.trim(),
      lunch_start_from: form.lunch_enabled ? form.lunch_start_from : null,
      lunch_start_until: form.lunch_enabled ? form.lunch_start_until : null,
      lunch_duration_minutes: calculatedLunchDuration,
      return_tolerance_minutes: form.lunch_enabled ? form.return_tolerance_minutes : 0,
    });
  };

  const scheduleSummary = formatScheduleRange(form.start_time, form.end_time);
  const lunchSummary = form.lunch_enabled && form.lunch_start_from && form.lunch_start_until
    ? `${formatScheduleTime(form.lunch_start_from)} – ${formatScheduleTime(form.lunch_start_until)}`
    : 'Sin marcaciones de almuerzo';
  const calculatedLunchDuration = lunchDuration(form.lunch_start_from, form.lunch_start_until);

  return (
    <Modal
      open={schedule !== null}
      onClose={onClose}
      title={editing ? 'Actualizar jornada laboral' : 'Crear jornada laboral'}
      description={editing ? 'Programa los cambios sin alterar los registros anteriores.' : 'Configura una jornada reutilizable para la empresa y sus sedes.'}
      icon={<CalendarClock />}
      maxWidth={820}
      className={styles.dialog}
      footer={<>
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="rrhh-schedule-form" loading={saving}>
          {editing ? 'Programar actualización' : 'Guardar jornada'}
        </Button>
      </>}
    >
      <form id="rrhh-schedule-form" className={styles.form} onSubmit={submit} noValidate>
        {error && <div className={styles.formError} role="alert"><Info /><span>{error}</span></div>}

        <div className={styles.changeNotice}>
          <span><History /></span>
          <div>
            <strong>{editing ? 'Actualización con historial' : 'Nueva política de asistencia'}</strong>
            <p>{editing
              ? 'La configuración actual seguirá disponible para auditoría.'
              : 'Podrás asignarla posteriormente por empresa, sede o colaborador.'}</p>
          </div>
          <small>{editing ? `Vigente desde ${formatPolicyDate(schedule.effective_from)}` : `Aplicación desde ${formatPolicyDate(form.effective_from)}`}</small>
        </div>

        <section className={styles.policySection}>
          <header>
            <span><CalendarDays /></span>
            <div><h3>Identificación y vigencia</h3><p>Nombre operativo y fecha de aplicación.</p></div>
          </header>
          <div className={styles.twoColumnGrid}>
            <label>
              <span>Nombre de la jornada</span>
              <input autoFocus required value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Oficina jornada completa" />
            </label>
            <label>
              <span>Aplicar desde</span>
              <input required type="date" min={localToday()} value={form.effective_from} onChange={event => update('effective_from', event.target.value)} />
            </label>
          </div>
        </section>

        <section className={styles.policySection}>
          <header>
            <span><Clock3 /></span>
            <div><h3>Horario principal</h3><p>Entrada, salida y reglas de puntualidad.</p></div>
            <output className={styles.sectionSummary}>{scheduleSummary}</output>
          </header>
          <div className={styles.fourColumnGrid}>
            <TwelveHourField label="Entrada" value={form.start_time} onChange={value => update('start_time', value)} />
            <TwelveHourField label="Salida" value={form.end_time} onChange={value => update('end_time', value)} />
            <label><span>Tolerancia</span><div className={styles.numberControl}><input type="number" min="0" max="180" value={form.tolerance_minutes} onChange={event => update('tolerance_minutes', Number(event.target.value))} /><em>min</em></div></label>
            <label><span>Entrada disponible antes</span><div className={styles.numberControl}><input type="number" min="0" max="180" value={form.entry_open_before_minutes} onChange={event => update('entry_open_before_minutes', Number(event.target.value))} /><em>min</em></div></label>
          </div>
          <p className={styles.sectionHint}><Info />Una marcación anticipada registra la hora real, pero la jornada y el cálculo laboral comienzan a la hora programada.</p>
        </section>

        <section className={styles.policySection}>
          <header>
            <span className={styles.lunchIcon}><Coffee /></span>
            <div><h3>Control de almuerzo</h3><p>Define la salida, duración y regreso del descanso.</p></div>
            <label className={styles.switchControl}>
              <input type="checkbox" checked={form.lunch_enabled} onChange={event => update('lunch_enabled', event.target.checked)} />
              <i aria-hidden="true" />
              <span>{form.lunch_enabled ? 'Activo' : 'No aplica'}</span>
            </label>
          </header>
          {form.lunch_enabled ? <>
            <output className={styles.inlineSummary}><Coffee />{lunchSummary}<span>{formatDuration(calculatedLunchDuration)} de descanso</span></output>
            <div className={styles.threeColumnGrid}>
              <TwelveHourField label="Salida al almuerzo" value={form.lunch_start_from ?? '13:00'} onChange={value => updateLunchTime('lunch_start_from', value)} />
              <TwelveHourField label="Regreso del almuerzo" value={form.lunch_start_until ?? '14:00'} onChange={value => updateLunchTime('lunch_start_until', value)} />
              <div className={styles.calculatedDuration}>
                <span>Duración calculada</span>
                <strong><TimerReset />{formatDuration(calculatedLunchDuration)}</strong>
                <small>Se obtiene automáticamente del horario.</small>
              </div>
              <label><span>Tolerancia de regreso</span><div className={styles.numberControl}><input type="number" min="0" max="120" value={form.return_tolerance_minutes} onChange={event => update('return_tolerance_minutes', Number(event.target.value))} /><em>min</em></div></label>
              <label><span>Salida disponible antes</span><div className={styles.numberControl}><input type="number" min="0" max="120" value={form.lunch_open_before_minutes} onChange={event => update('lunch_open_before_minutes', Number(event.target.value))} /><em>min</em></div></label>
              <label><span>Regreso disponible antes</span><div className={styles.numberControl}><input type="number" min="0" max="120" value={form.return_open_before_minutes} onChange={event => update('return_open_before_minutes', Number(event.target.value))} /><em>min</em></div></label>
            </div>
          </> : <div className={styles.disabledPolicy}><Coffee /><span><strong>Sin marcaciones de almuerzo</strong><small>La aplicación no mostrará las acciones de salida y regreso.</small></span></div>}
        </section>

        <section className={styles.policySection}>
          <header>
            <span className={styles.overtimeIcon}><TimerReset /></span>
            <div><h3>Cierre y sobretiempo</h3><p>Controla la salida final y las alertas para revisión.</p></div>
          </header>
          <div className={styles.twoColumnGrid}>
            <label><span>Salida disponible antes</span><div className={styles.numberControl}><input type="number" min="0" max="180" value={form.exit_open_before_minutes} onChange={event => update('exit_open_before_minutes', Number(event.target.value))} /><em>min</em></div></label>
            <label><span>Revisar sobretiempo desde</span><div className={styles.numberControl}><input type="number" min="1" max="180" value={form.overtime_threshold_minutes} onChange={event => update('overtime_threshold_minutes', Number(event.target.value))} /><em>min</em></div></label>
          </div>
          <div className={styles.auditNotice}><ShieldCheck /><span><strong>Aprobación administrativa</strong><small>El tiempo adicional genera una solicitud de revisión. No se aprueba ni se paga automáticamente.</small></span></div>
        </section>
      </form>
    </Modal>
  );
}
