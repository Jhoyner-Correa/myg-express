import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import type { Site, WorkCalendarInput, WorkSchedule } from '../types';
import { validateWorkCalendarInput } from '../domain';
import styles from '../Rrhh.module.css';

type Props = {
  open: boolean;
  siteId: number;
  sites: Site[];
  schedules: WorkSchedule[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: WorkCalendarInput) => Promise<void>;
};

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function initialInput(siteId: number): WorkCalendarInput {
  const today = localToday();
  return {
    scope: 'EMPRESA', site_id: siteId, name: '', type: 'FERIADO',
    start_date: today, end_date: today, schedule_id: null, description: '',
  };
}

export function CalendarEventModal({ open, siteId, sites, schedules, saving, onClose, onSave }: Props) {
  const [form, setForm] = useState<WorkCalendarInput>(() => initialInput(siteId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(initialInput(siteId));
    setError(null);
  }, [open, siteId]);

  const update = <K extends keyof WorkCalendarInput>(field: K, value: WorkCalendarInput[K]) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validationError = validateWorkCalendarInput(form);
    if (validationError) { setError(validationError); return; }
    setError(null);
    await onSave({
      ...form,
      name: form.name.trim(),
      site_id: form.scope === 'SEDE' ? form.site_id : null,
      schedule_id: form.type === 'JORNADA_ESPECIAL' ? form.schedule_id : null,
      description: form.description?.trim() || null,
    });
  };

  return <Modal
    open={open}
    onClose={onClose}
    title="Agregar evento laboral"
    description="Define una excepción sin modificar los horarios semanales del personal."
    maxWidth={660}
    footer={<><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="rrhh-calendar-form" loading={saving}>Agregar al calendario</Button></>}
  >
    <form id="rrhh-calendar-form" className={styles.form} onSubmit={submit}>
      {error && <div className={styles.formError} role="alert">{error}</div>}
      <div className={styles.scheduleFormIntro}>
        <strong>Regla auditable</strong>
        <span>Una excepción de sede prevalece sobre la corporativa para la misma fecha.</span>
      </div>
      <div className={styles.formGrid}>
        <label className={styles.fullField}>Nombre del evento<input autoFocus maxLength={120} value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Fiestas Patrias" /></label>
        <label>Alcance<select value={form.scope} onChange={event => update('scope', event.target.value as WorkCalendarInput['scope'])}><option value="EMPRESA">Toda la empresa</option><option value="SEDE">Una sede</option></select></label>
        <label>Sede<select value={form.site_id ?? siteId} disabled={form.scope === 'EMPRESA'} onChange={event => update('site_id', Number(event.target.value))}>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        <label>Tipo de día<select value={form.type} onChange={event => update('type', event.target.value as WorkCalendarInput['type'])}><option value="FERIADO">Feriado</option><option value="DIA_NO_LABORABLE">Día no laborable</option><option value="JORNADA_ESPECIAL">Jornada especial</option></select></label>
        <label>Horario aplicable<select value={form.schedule_id ?? ''} disabled={form.type !== 'JORNADA_ESPECIAL'} onChange={event => update('schedule_id', event.target.value ? Number(event.target.value) : null)}><option value="">Seleccionar horario</option>{schedules.filter(item => item.status === 'ACTIVO').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Desde<input type="date" value={form.start_date} onChange={event => update('start_date', event.target.value)} /></label>
        <label>Hasta<input type="date" min={form.start_date} value={form.end_date} onChange={event => update('end_date', event.target.value)} /></label>
        <label className={styles.fullField}>Descripción opcional<textarea rows={3} maxLength={500} value={form.description ?? ''} onChange={event => update('description', event.target.value)} placeholder="Motivo o indicaciones para el personal" /></label>
      </div>
    </form>
  </Modal>;
}
