import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import type { SchedulePolicyInput, WorkSchedule } from '../types';
import styles from '../Rrhh.module.css';

type Props = {
  schedule: WorkSchedule | 'new' | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: SchedulePolicyInput) => Promise<void>;
};

function localToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function initialPolicy(schedule: WorkSchedule | 'new' | null): SchedulePolicyInput {
  return {
    name: schedule && schedule !== 'new' ? schedule.name : '',
    start_time: schedule && schedule !== 'new' ? schedule.start_time.slice(0, 5) : '09:00',
    end_time: schedule && schedule !== 'new' ? schedule.end_time.slice(0, 5) : '18:00',
    tolerance_minutes: schedule && schedule !== 'new' ? schedule.tolerance_minutes : 10,
    lunch_enabled: schedule && schedule !== 'new' ? schedule.lunch_enabled : true,
    lunch_start_from: schedule && schedule !== 'new' && schedule.lunch_start_from ? schedule.lunch_start_from.slice(0, 5) : '13:00',
    lunch_start_until: schedule && schedule !== 'new' && schedule.lunch_start_until ? schedule.lunch_start_until.slice(0, 5) : '14:00',
    lunch_duration_minutes: schedule && schedule !== 'new' ? schedule.lunch_duration_minutes : 60,
    return_tolerance_minutes: schedule && schedule !== 'new' ? schedule.return_tolerance_minutes : 5,
    effective_from: localToday(),
  };
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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) { setError('Ingresa un nombre para identificar la jornada.'); return; }
    if (form.start_time >= form.end_time) { setError('La hora de salida debe ser posterior a la entrada.'); return; }
    if (form.lunch_enabled && (!form.lunch_start_from || !form.lunch_start_until || form.lunch_start_from >= form.lunch_start_until)) {
      setError('Configura correctamente la ventana permitida para iniciar el almuerzo.'); return;
    }
    setError(null);
    await onSave({
      ...form,
      name: form.name.trim(),
      lunch_start_from: form.lunch_enabled ? form.lunch_start_from : null,
      lunch_start_until: form.lunch_enabled ? form.lunch_start_until : null,
      lunch_duration_minutes: form.lunch_enabled ? form.lunch_duration_minutes : 0,
      return_tolerance_minutes: form.lunch_enabled ? form.return_tolerance_minutes : 0,
    });
  };

  return (
    <Modal
      open={schedule !== null}
      onClose={onClose}
      title={editing ? 'Actualizar jornada laboral' : 'Crear jornada laboral'}
      description={editing ? 'La nueva política tendrá vigencia desde la fecha indicada y conservará el historial anterior.' : 'Define una política reutilizable para asignarla al personal.'}
      maxWidth={700}
      footer={<><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="rrhh-schedule-form" loading={saving}>{editing ? 'Guardar nueva versión' : 'Crear horario'}</Button></>}
    >
      <form id="rrhh-schedule-form" className={styles.form} onSubmit={submit}>
        {error && <div className={styles.formError} role="alert">{error}</div>}
        <div className={styles.scheduleFormIntro}>
          <strong>{editing ? `Versión actual ${schedule.version}` : 'Nueva política de asistencia'}</strong>
          <span>{editing ? `Vigente desde ${schedule.effective_from}` : 'Los cambios futuros se administrarán mediante versiones, sin alterar asistencias pasadas.'}</span>
        </div>
        <div className={styles.formGrid}>
          <label className={styles.fullField}>Nombre del horario<input autoFocus value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Oficina jornada completa" /></label>
          <label>Hora de entrada<input type="time" value={form.start_time} onChange={event => update('start_time', event.target.value)} /></label>
          <label>Hora de salida<input type="time" value={form.end_time} onChange={event => update('end_time', event.target.value)} /></label>
          <label>Tolerancia de entrada (min)<input type="number" min="0" max="180" value={form.tolerance_minutes} onChange={event => update('tolerance_minutes', Number(event.target.value))} /></label>
          <label>Aplicar desde<input type="date" min={localToday()} value={form.effective_from} onChange={event => update('effective_from', event.target.value)} /></label>
        </div>
        <label className={styles.scheduleToggle}>
          <input type="checkbox" checked={form.lunch_enabled} onChange={event => update('lunch_enabled', event.target.checked)} />
          <span><strong>Controlar salida y regreso de almuerzo</strong><small>La app mostrará las marcaciones de almuerzo solo para esta jornada.</small></span>
        </label>
        {form.lunch_enabled && <fieldset className={styles.lunchPolicy}>
          <legend>Política de almuerzo</legend>
          <label>Salida permitida desde<input type="time" value={form.lunch_start_from ?? ''} onChange={event => update('lunch_start_from', event.target.value)} /></label>
          <label>Salida permitida hasta<input type="time" value={form.lunch_start_until ?? ''} onChange={event => update('lunch_start_until', event.target.value)} /></label>
          <label>Duración (min)<input type="number" min="1" max="300" value={form.lunch_duration_minutes} onChange={event => update('lunch_duration_minutes', Number(event.target.value))} /></label>
          <label>Tolerancia de regreso (min)<input type="number" min="0" max="120" value={form.return_tolerance_minutes} onChange={event => update('return_tolerance_minutes', Number(event.target.value))} /></label>
        </fieldset>}
      </form>
    </Modal>
  );
}
