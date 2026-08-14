import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, CalendarOff, Clock3, MapPin, Plus, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type { Site, WorkCalendarEvent, WorkCalendarInput, WorkSchedule } from '../types';
import styles from '../Rrhh.module.css';
import { CalendarEventModal } from './CalendarEventModal';

type Props = { siteId: number; sites: Site[]; schedules: WorkSchedule[]; canManage: boolean };

const typeLabel: Record<WorkCalendarEvent['type'], string> = {
  FERIADO: 'Feriado', DIA_NO_LABORABLE: 'Día no laborable', JORNADA_ESPECIAL: 'Jornada especial',
};

function queryPeriod() {
  const year = new Date().getFullYear();
  return { from: `${year}-01-01`, until: `${year + 1}-12-31` };
}
function displayDate(start: string, end: string) {
  const format = (value: string) => new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
  return start === end ? format(start) : `${format(start)} – ${format(end)}`;
}

export function WorkCalendarManager({ siteId, sites, schedules, canManage }: Props) {
  const [events, setEvents] = useState<WorkCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState<WorkCalendarEvent | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const { from, until } = queryPeriod();
    setLoading(true);
    try { setEvents(await rrhhService.getWorkCalendar(siteId, from, until, signal)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [siteId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(error => {
      if (!controller.signal.aborted) showToast(getApiErrorMessage(error, 'No se pudo cargar el calendario laboral.'), 'error');
    });
    return () => controller.abort();
  }, [load]);

  const visibleEvents = useMemo(() => [...events].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'ACTIVO' ? -1 : 1;
    return left.start_date.localeCompare(right.start_date);
  }), [events]);

  const create = async (input: WorkCalendarInput) => {
    setSaving(true);
    try {
      await rrhhService.createWorkCalendarEvent(input);
      await load();
      setCreating(false);
      showToast('Calendario laboral actualizado.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo agregar el evento.'), 'error'); }
    finally { setSaving(false); }
  };

  const confirmCancel = async () => {
    if (!canceling) return;
    setSaving(true);
    try {
      await rrhhService.cancelWorkCalendarEvent(canceling.id);
      await load();
      setCanceling(null);
      showToast('Evento cancelado; el historial se conservó.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo cancelar el evento.'), 'error'); }
    finally { setSaving(false); }
  };

  return <section className={`${styles.configCard} ${styles.calendarManager}`}>
    <header><span><CalendarDays /></span><div><h2>Calendario laboral</h2><p>Feriados y excepciones corporativas o por sede.</p></div>{canManage && <Button size="sm" icon={<Plus size={15} />} onClick={() => setCreating(true)}>Nuevo evento</Button>}</header>
    <div className={styles.calendarLegend}><span><Building2 /> Corporativo</span><span><MapPin /> Específico de sede</span><small>Se muestran {new Date().getFullYear()} y {new Date().getFullYear() + 1}</small></div>
    <div className={styles.calendarList} aria-busy={loading}>
      {visibleEvents.map(event => <article key={event.id} className={event.status === 'CANCELADO' ? styles.calendarCanceled : ''}>
        <span className={`${styles.calendarType} ${styles[`calendar${event.type}`]}`}>{event.type === 'JORNADA_ESPECIAL' ? <Clock3 /> : <CalendarOff />}</span>
        <div className={styles.calendarInfo}><div><strong>{event.name}</strong><span>{typeLabel[event.type]}</span></div><p>{displayDate(event.start_date, event.end_date)}</p><small>{event.scope === 'EMPRESA' ? 'Toda la empresa' : event.site_name}{event.schedule_name ? ` · ${event.schedule_name}` : ''}</small></div>
        <span className={styles.calendarScope}>{event.scope === 'EMPRESA' ? <Building2 /> : <MapPin />}{event.scope === 'EMPRESA' ? 'Corporativo' : 'Sede'}</span>
        {canManage && event.status === 'ACTIVO' ? <button className={styles.calendarCancel} type="button" title="Cancelar evento" aria-label={`Cancelar ${event.name}`} onClick={() => setCanceling(event)}><XCircle /></button> : <small className={styles.calendarCanceledLabel}>{event.status === 'CANCELADO' ? 'Cancelado' : ''}</small>}
      </article>)}
      {!loading && !visibleEvents.length && <div className={styles.smallEmpty}>No hay excepciones registradas para este periodo.</div>}
      {loading && <div className={styles.smallEmpty}>Consultando calendario...</div>}
    </div>
    <CalendarEventModal open={creating} siteId={siteId} sites={sites} schedules={schedules} saving={saving} onClose={() => setCreating(false)} onSave={create} />
    <Modal open={canceling !== null} onClose={() => setCanceling(null)} title="Cancelar evento laboral" description="La regla dejará de aplicarse, pero permanecerá en el historial de auditoría." footer={<><Button variant="secondary" onClick={() => setCanceling(null)}>Volver</Button><Button variant="danger" loading={saving} onClick={() => void confirmCancel()}>Cancelar evento</Button></>}>
      <div className={styles.resolutionSummary}>Confirma que deseas cancelar <strong>{canceling?.name}</strong>. Las marcaciones futuras volverán a usar la regla laboral que corresponda.</div>
    </Modal>
  </section>;
}
