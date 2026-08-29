import { useEffect, useState, type FormEvent } from 'react';
import {
  Building2, CalendarCheck2, CalendarDays, CalendarOff, CalendarPlus2,
  Check, Clock3, FileText, MapPin, ShieldCheck,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import type { Site, WorkCalendarInput, WorkSchedule } from '../types';
import { validateWorkCalendarInput } from '../domain';
import styles from './CalendarEventModal.module.css';

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
    description="Define una excepción sin modificar la semana habitual."
    icon={<CalendarPlus2 />}
    maxWidth={720}
    className={styles.dialog}
    footer={<><Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button><Button type="submit" form="rrhh-calendar-form" variant="corporate" loading={saving}>Agregar al calendario</Button></>}
  >
    <form id="rrhh-calendar-form" className={styles.form} onSubmit={submit}>
      {error && <div className={styles.formError} role="alert">{error}</div>}
      <div className={styles.auditBanner}><ShieldCheck /><div><strong>Registro auditable</strong><span>La excepción quedará asociada al administrador, alcance y periodo seleccionados.</span></div></div>

      <section className={styles.formSection}>
        <header className={styles.sectionHeading}><span>01</span><div><h3>Identificación</h3><p>Nombre visible en el calendario y reportes.</p></div></header>
        <label className={styles.field}><span>Nombre del evento</span><div className={styles.controlWithIcon}><CalendarDays /><input autoFocus maxLength={120} value={form.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Fiestas Patrias" /></div></label>
      </section>

      <section className={styles.formSection}>
        <header className={styles.sectionHeading}><span>02</span><div><h3>Aplicación</h3><p>Define dónde y qué regla laboral reemplazará.</p></div></header>
        <fieldset className={styles.choiceGroup}>
          <legend>Alcance</legend>
          <div className={styles.scopeChoices}>
            <button type="button" className={form.scope === 'EMPRESA' ? styles.selectedChoice : ''} aria-pressed={form.scope === 'EMPRESA'} onClick={() => update('scope', 'EMPRESA')}>
              <span className={styles.choiceIcon}><Building2 /></span>
              <span className={styles.choiceCopy}><strong>Toda la empresa</strong><small>Política corporativa para todas las sedes</small></span>
              <span className={styles.choiceIndicator}><Check /></span>
            </button>
            <button type="button" className={form.scope === 'SEDE' ? styles.selectedChoice : ''} aria-pressed={form.scope === 'SEDE'} onClick={() => update('scope', 'SEDE')}>
              <span className={styles.choiceIcon}><MapPin /></span>
              <span className={styles.choiceCopy}><strong>Sede específica</strong><small>Aplicación exclusiva en una ubicación</small></span>
              <span className={styles.choiceIndicator}><Check /></span>
            </button>
          </div>
        </fieldset>
        {form.scope === 'SEDE' && <label className={styles.field}><span>Sede</span><div className={styles.controlWithIcon}><MapPin /><select value={form.site_id ?? siteId} onChange={event => update('site_id', Number(event.target.value))}>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div></label>}
        <fieldset className={styles.choiceGroup}>
          <legend>Tipo de excepción</legend>
          <div className={styles.typeChoices}>
            <button type="button" className={form.type === 'FERIADO' ? styles.selectedChoice : ''} aria-pressed={form.type === 'FERIADO'} onClick={() => update('type', 'FERIADO')}>
              <span className={styles.choiceIcon}><CalendarCheck2 /></span>
              <span className={styles.choiceCopy}><strong>Feriado</strong><small>Fecha oficial sin jornada laboral</small></span>
              <span className={styles.choiceIndicator}><Check /></span>
            </button>
            <button type="button" className={form.type === 'DIA_NO_LABORABLE' ? styles.selectedChoice : ''} aria-pressed={form.type === 'DIA_NO_LABORABLE'} onClick={() => update('type', 'DIA_NO_LABORABLE')}>
              <span className={styles.choiceIcon}><CalendarOff /></span>
              <span className={styles.choiceCopy}><strong>Día no laborable</strong><small>Suspensión administrativa de la jornada</small></span>
              <span className={styles.choiceIndicator}><Check /></span>
            </button>
            <button type="button" className={form.type === 'JORNADA_ESPECIAL' ? styles.selectedChoice : ''} aria-pressed={form.type === 'JORNADA_ESPECIAL'} onClick={() => update('type', 'JORNADA_ESPECIAL')}>
              <span className={styles.choiceIcon}><Clock3 /></span>
              <span className={styles.choiceCopy}><strong>Jornada especial</strong><small>Reemplaza el horario habitual del día</small></span>
              <span className={styles.choiceIndicator}><Check /></span>
            </button>
          </div>
        </fieldset>
        {form.type === 'JORNADA_ESPECIAL' && <label className={styles.field}><span>Horario aplicable</span><div className={styles.controlWithIcon}><Clock3 /><select value={form.schedule_id ?? ''} onChange={event => update('schedule_id', event.target.value ? Number(event.target.value) : null)}><option value="">Seleccionar horario</option>{schedules.filter(item => item.status === 'ACTIVO').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></label>}
      </section>

      <section className={styles.formSection}>
        <header className={styles.sectionHeading}><span>03</span><div><h3>Vigencia</h3><p>Periodo en que la excepción reemplazará la política habitual.</p></div></header>
        <div className={styles.dateGrid}>
          <label className={styles.field}><span>Desde</span><input type="date" value={form.start_date} onChange={event => update('start_date', event.target.value)} /></label>
          <label className={styles.field}><span>Hasta</span><input type="date" min={form.start_date} value={form.end_date} onChange={event => update('end_date', event.target.value)} /></label>
        </div>
      </section>

      <section className={styles.formSection}>
        <header className={styles.sectionHeading}><span>04</span><div><h3>Detalle administrativo</h3><p>Información adicional para futuras consultas.</p></div></header>
        <label className={styles.field}><span>Descripción <small>Opcional</small></span><div className={`${styles.controlWithIcon} ${styles.textareaControl}`}><FileText /><textarea rows={3} maxLength={500} value={form.description ?? ''} onChange={event => update('description', event.target.value)} placeholder="Motivo o indicaciones para el personal" /></div><small className={styles.characterCount}>{form.description?.length ?? 0}/500</small></label>
      </section>
    </form>
  </Modal>;
}
