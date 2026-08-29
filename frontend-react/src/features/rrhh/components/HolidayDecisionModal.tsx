import { useEffect, useState } from 'react';
import { BriefcaseBusiness, CalendarCheck2, CalendarClock, CalendarOff, MapPin, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import type { HolidayProposal, HolidayProposalDecisionInput, Site, WorkSchedule } from '../types';
import styles from './WorkCalendarManager.module.css';

type Props = {
  proposal: HolidayProposal | null;
  sites: Site[];
  schedules: WorkSchedule[];
  defaultSiteId: number;
  saving: boolean;
  onClose: () => void;
  onSave: (input: HolidayProposalDecisionInput) => Promise<void>;
};

const choices = [
  { value: 'NO_LABORABLE', label: 'No laborable', help: 'No se exigirá asistencia.', icon: CalendarOff },
  { value: 'JORNADA_NORMAL', label: 'Jornada normal', help: 'Se trabajará con el horario habitual.', icon: CalendarCheck2 },
  { value: 'JORNADA_ESPECIAL', label: 'Jornada especial', help: 'Aplicará un horario excepcional.', icon: CalendarClock },
  { value: 'DESCARTAR', label: 'Descartar', help: 'No corresponde a la empresa.', icon: XCircle },
] as const;

function proposalDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

export function HolidayDecisionModal({ proposal, sites, schedules, defaultSiteId, saving, onClose, onSave }: Props) {
  const [form, setForm] = useState<HolidayProposalDecisionInput>({
    decision: 'NO_LABORABLE', scope: 'EMPRESA', site_id: null, schedule_id: null, comment: '',
  });

  useEffect(() => {
    if (!proposal) return;
    setForm({ decision: 'NO_LABORABLE', scope: 'EMPRESA', site_id: defaultSiteId, schedule_id: null, comment: '' });
  }, [proposal, defaultSiteId]);

  const save = () => onSave({
    ...form,
    site_id: form.scope === 'SEDE' ? form.site_id : null,
    schedule_id: form.decision === 'JORNADA_ESPECIAL' ? form.schedule_id : null,
  });

  return <Modal
    open={proposal !== null}
    onClose={onClose}
    title="Decisión de calendario laboral"
    description="Confirma cómo impactará este día en la asistencia."
    icon={<ShieldCheck />}
    maxWidth={760}
    className={styles.decisionDialog}
    footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={() => void save()}>Registrar decisión</Button></>}
  >
    <div className={styles.proposalIdentity}>
      <div><small>FERIADO PROPUESTO</small><strong>{proposal?.local_name}</strong><span>{proposalDate(proposal?.date)}</span></div>
      <a href={proposal?.source_url} target="_blank" rel="noreferrer">Consultar fuente</a>
    </div>

    <fieldset className={styles.decisionChoices}>
      <legend>Decisión operativa</legend>
      {choices.map(choice => {
        const Icon = choice.icon;
        return <label key={choice.value} className={form.decision === choice.value ? styles.choiceSelected : ''}>
          <input type="radio" name="decision" value={choice.value} checked={form.decision === choice.value} onChange={() => setForm(current => ({ ...current, decision: choice.value }))} />
          <Icon /><span><strong>{choice.label}</strong><small>{choice.help}</small></span>
        </label>;
      })}
    </fieldset>

    {form.decision !== 'DESCARTAR' && <div className={styles.decisionFields}>
      <label>Alcance
        <span className={styles.selectWithIcon}><BriefcaseBusiness /><select value={form.scope} onChange={event => setForm(current => ({ ...current, scope: event.target.value as 'EMPRESA' | 'SEDE' }))}><option value="EMPRESA">Toda la empresa</option><option value="SEDE">Una sede específica</option></select></span>
      </label>
      {form.scope === 'SEDE' && <label>Sede
        <span className={styles.selectWithIcon}><MapPin /><select value={form.site_id ?? ''} onChange={event => setForm(current => ({ ...current, site_id: Number(event.target.value) }))}>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></span>
      </label>}
      {form.decision === 'JORNADA_ESPECIAL' && <label>Horario especial
        <select value={form.schedule_id ?? ''} onChange={event => setForm(current => ({ ...current, schedule_id: Number(event.target.value) || null }))}><option value="">Seleccionar horario</option>{schedules.filter(schedule => schedule.status === 'ACTIVO').map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.name}</option>)}</select>
      </label>}
    </div>}

    <label className={styles.decisionComment}>Comentario administrativo <span>Opcional</span>
      <textarea maxLength={500} rows={3} value={form.comment} onChange={event => setForm(current => ({ ...current, comment: event.target.value }))} placeholder="Norma, acuerdo interno o detalle relevante para auditoría." />
    </label>
    <p className={styles.auditNote}><ShieldCheck /> La decisión conservará responsable, fecha, fuente y alcance aplicado.</p>
  </Modal>;
}
