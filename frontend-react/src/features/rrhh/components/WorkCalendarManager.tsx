import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, CalendarCheck2, CalendarDays, CalendarOff, ChevronLeft, ChevronRight,
  Clock3, CloudDownload, Info, MapPin, Plus, RotateCw, ShieldCheck, XCircle,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { getApiErrorMessage } from '../../../core/api/errors';
import { showToast } from '../../../core/utils/toast';
import { rrhhService } from '../rrhh.service';
import type {
  HolidayProposal, HolidayProposalDecisionInput, Site, WorkCalendarEvent,
  WorkCalendarInput, WorkSchedule,
} from '../types';
import { buildMonthGrid, monthBounds, monthKey, shiftMonth } from '../work-calendar';
import { CalendarEventModal } from './CalendarEventModal';
import { HolidayDecisionModal } from './HolidayDecisionModal';
import styles from './WorkCalendarManager.module.css';

type Props = {
  siteId: number;
  sites: Site[];
  schedules: WorkSchedule[];
  canManage: boolean;
  onSiteChange: (siteId: number) => void;
};
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function monthTitle(value: string) {
  return new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}-01T12:00:00Z`));
}
function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${value}T12:00:00Z`));
}
function eventCoversDate(event: WorkCalendarEvent, date: string) {
  return event.status === 'ACTIVO' && event.start_date <= date && event.end_date >= date;
}
function calendarEventTypeLabel(type: WorkCalendarEvent['type']) {
  if (type === 'JORNADA_ESPECIAL') return 'Jornada especial';
  if (type === 'DIA_NO_LABORABLE') return 'Día no laborable';
  return 'Feriado';
}

export function WorkCalendarManager({ siteId, sites, schedules, canManage, onSiteChange }: Props) {
  const [month, setMonth] = useState(() => monthKey());
  const [events, setEvents] = useState<WorkCalendarEvent[]>([]);
  const [proposals, setProposals] = useState<HolidayProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<HolidayProposal | null>(null);
  const [canceling, setCanceling] = useState<WorkCalendarEvent | null>(null);
  const year = Number(month.slice(0, 4));

  const load = useCallback(async (signal?: AbortSignal) => {
    const range = monthBounds(month);
    setLoading(true);
    try {
      const [calendar, imported] = await Promise.all([
        rrhhService.getWorkCalendar(siteId, range.from, range.until, signal),
        rrhhService.getHolidayProposals(year, signal),
      ]);
      setEvents(calendar); setProposals(imported);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [month, siteId, year]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(error => {
      if (!controller.signal.aborted) showToast(getApiErrorMessage(error, 'No se pudo cargar el calendario laboral.'), 'error');
    });
    return () => controller.abort();
  }, [load]);

  const days = useMemo(() => buildMonthGrid(month), [month]);
  const pending = useMemo(() => proposals.filter(item => item.status === 'PENDIENTE'), [proposals]);
  const monthPending = useMemo(() => pending.filter(item => item.date.startsWith(month)), [pending, month]);
  const activeEvents = useMemo(() => events.filter(item => item.status === 'ACTIVO'), [events]);

  const create = async (input: WorkCalendarInput) => {
    setSaving(true);
    try {
      await rrhhService.createWorkCalendarEvent(input); await load(); setCreating(false);
      showToast('Calendario laboral actualizado.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo agregar el evento.'), 'error'); }
    finally { setSaving(false); }
  };
  const synchronize = async () => {
    setSyncing(true);
    try {
      const result = await rrhhService.syncHolidayProposals(year);
      setProposals(result.proposals);
      showToast(`${result.summary.received} feriados importados para revisión.`, 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo sincronizar el calendario oficial.'), 'error'); }
    finally { setSyncing(false); }
  };
  const decide = async (input: HolidayProposalDecisionInput) => {
    if (!selectedProposal) return;
    setSaving(true);
    try {
      await rrhhService.decideHolidayProposal(selectedProposal.id, input);
      setSelectedProposal(null); await load();
      showToast('Decisión laboral registrada y auditada.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo registrar la decisión.'), 'error'); }
    finally { setSaving(false); }
  };
  const confirmCancel = async () => {
    if (!canceling) return;
    setSaving(true);
    try {
      await rrhhService.cancelWorkCalendarEvent(canceling.id); setCanceling(null); await load();
      showToast('Evento cancelado; el historial fue conservado.', 'success');
    } catch (error) { showToast(getApiErrorMessage(error, 'No se pudo cancelar el evento.'), 'error'); }
    finally { setSaving(false); }
  };

  return <section className={styles.manager} aria-busy={loading}>
    <header className={styles.managerHeader}>
      <div className={styles.titleBlock}><span><CalendarDays /></span><div><h2>Calendario laboral</h2><p>{pending.length} {pending.length === 1 ? 'fecha requiere' : 'fechas requieren'} revisión administrativa</p></div></div>
      <div className={styles.headerActions}>
        <label className={styles.calendarSite}><span>SEDE</span><div><MapPin /><select aria-label="Sede del calendario" value={siteId} onChange={event => onSiteChange(Number(event.target.value))}>{sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div></label>
        <button type="button" className={styles.reviewTrigger} onClick={() => setReviewing(true)}>
          <ShieldCheck />
          <span><small>CONTROL</small><strong>Revisar pendientes</strong></span>
          <b>{pending.length}</b>
        </button>
      </div>
    </header>
    <div className={styles.calendarStatusBar}>
      <div className={styles.legend} aria-label="Estados del calendario"><span><i className={styles.confirmedDot} /> Confirmado</span><span><i className={styles.pendingDot} /> Por confirmar</span><span><i className={styles.specialDot} /> Jornada especial</span></div>
      <div className={styles.statusActions}>
        {canManage && <button type="button" className={`${styles.actionButton} ${styles.importAction}`} disabled={syncing} onClick={() => void synchronize()}>
          <span className={styles.actionIcon}>{syncing ? <RotateCw className={styles.actionSpinner} /> : <CloudDownload />}</span>
          <span className={styles.actionCopy}><strong>{syncing ? 'Importando…' : 'Importar feriados'}</strong><small>Calendario oficial de Perú</small></span>
        </button>}
        {canManage && <button type="button" className={`${styles.actionButton} ${styles.createAction}`} onClick={() => setCreating(true)}>
          <span className={styles.actionIcon}><Plus /></span>
          <span className={styles.actionCopy}><strong>Nueva excepción</strong><small>Feriado o jornada especial</small></span>
        </button>}
      </div>
    </div>
    <div className={styles.workspace}>
      <div className={styles.monthPanel}>
        <div className={styles.calendarToolbar}>
          <div className={styles.monthNavigation}>
            <span className={styles.arrowGroup}><button type="button" onClick={() => setMonth(current => shiftMonth(current, -1))} aria-label="Mes anterior"><ChevronLeft /></button><button type="button" onClick={() => setMonth(current => shiftMonth(current, 1))} aria-label="Mes siguiente"><ChevronRight /></button></span>
            <button type="button" className={styles.todayButton} onClick={() => setMonth(monthKey())}>Hoy</button>
          </div>
          <strong className={styles.currentMonth}>{monthTitle(month)}</strong>
        </div>
        <div className={styles.weekdays}>{weekdays.map(day => <span key={day}>{day}</span>)}</div>
        <div className={styles.monthGrid}>{days.map(day => {
          const dayEvents = activeEvents.filter(event => eventCoversDate(event, day.date));
          const dayProposals = monthPending.filter(proposal => proposal.date === day.date);
          return <div key={day.date} className={`${styles.dayCell} ${!day.inMonth ? styles.outsideMonth : ''} ${day.isToday ? styles.today : ''}`}>
            <div className={styles.dayNumber}><span>{day.day}</span>{day.isToday && <small>Hoy</small>}</div>
            <div className={styles.dayItems}>
              {dayEvents.slice(0, 2).map(event => <button key={`event-${event.id}`} type="button" disabled={!canManage} className={`${styles.eventChip} ${styles[`event${event.type}`]}`} title={`${event.name} · ${event.scope === 'EMPRESA' ? 'Toda la empresa' : event.site_name}`} aria-label={`Ver excepción confirmada: ${event.name}`} onClick={() => setCanceling(event)}>{event.type === 'JORNADA_ESPECIAL' ? <Clock3 /> : <CalendarCheck2 />}<span>{event.name}</span></button>)}
              {dayProposals.slice(0, 2).map(proposal => <button key={`proposal-${proposal.id}`} type="button" disabled={!canManage} className={styles.proposalChip} title={`${proposal.local_name} · pendiente de confirmación`} aria-label={`Revisar propuesta: ${proposal.local_name}`} onClick={() => setSelectedProposal(proposal)}><Info /><span>{proposal.local_name}</span></button>)}
              {dayEvents.length + dayProposals.length > 2 && <small className={styles.moreItems}>+{dayEvents.length + dayProposals.length - 2} más</small>}
            </div>
          </div>;
        })}</div>
      </div>
    </div>
    <CalendarEventModal open={creating} siteId={siteId} sites={sites} schedules={schedules} saving={saving} onClose={() => setCreating(false)} onSave={create} />
    <Modal open={reviewing} onClose={() => setReviewing(false)} title="Pendientes de confirmación" description="Revisa los feriados importados antes de aplicarlos a la asistencia." icon={<ShieldCheck />} maxWidth={720}>
      <div className={styles.reviewModalSummary}><span><Building2 /></span><div><small>CONTROL ADMINISTRATIVO</small><strong>{pending.length} fechas requieren una decisión</strong><p>Ninguna propuesta modifica la jornada hasta que sea confirmada.</p></div></div>
      <div className={`${styles.reviewList} ${styles.reviewDialogList}`}>
        {pending.map(proposal => <button type="button" disabled={!canManage} key={proposal.id} aria-label={`Revisar ${proposal.local_name} del ${shortDate(proposal.date)}`} onClick={() => { setReviewing(false); setSelectedProposal(proposal); }}><span className={styles.reviewDate}><b>{proposal.date.slice(8, 10)}</b><small>{shortDate(proposal.date).split(' ')[1]}</small></span><span><strong>{proposal.local_name}</strong><small><i /> Referencia nacional · por confirmar</small></span><span className={styles.reviewAction}>Revisar <ChevronRight /></span></button>)}
        {!pending.length && <div className={styles.reviewEmpty}><CalendarCheck2 /><strong>Calendario revisado</strong><span>No hay propuestas pendientes para {year}.</span></div>}
      </div>
      <footer className={styles.sourceNotice}><Building2 /><span><strong>Aplicación controlada</strong>Las fechas importadas solo entran en vigencia después de ser confirmadas.</span></footer>
    </Modal>
    <HolidayDecisionModal proposal={selectedProposal} sites={sites} schedules={schedules} defaultSiteId={siteId} saving={saving} onClose={() => setSelectedProposal(null)} onSave={decide} />
    <Modal
      open={canceling !== null}
      onClose={() => setCanceling(null)}
      title="Cancelar evento laboral"
      description="Retira la excepción del calendario sin eliminar su historial."
      icon={<XCircle />}
      iconVariant="plain"
      maxWidth={520}
      className={styles.cancelDialog}
      headerAccessory={<span className={styles.auditBadge}><ShieldCheck /> Auditable</span>}
      footer={<>
        <Button variant="secondary" onClick={() => setCanceling(null)}>Volver</Button>
        <Button variant="danger" loading={saving} onClick={() => void confirmCancel()}>Cancelar evento</Button>
      </>}
    >
      <div className={styles.cancelEventCard}>
        <span className={styles.cancelEventIcon}><CalendarOff /></span>
        <div className={styles.cancelEventIdentity}>
          <small>EVENTO SELECCIONADO</small>
          <strong>{canceling?.name}</strong>
          <span>{canceling ? calendarEventTypeLabel(canceling.type) : ''}</span>
        </div>
        <dl className={styles.cancelEventMeta}>
          <div><dt>Vigencia</dt><dd>{canceling ? `${shortDate(canceling.start_date)}${canceling.end_date !== canceling.start_date ? ` – ${shortDate(canceling.end_date)}` : ''}` : '—'}</dd></div>
          <div><dt>Alcance</dt><dd>{canceling?.scope === 'EMPRESA' ? 'Toda la empresa' : canceling?.site_name || 'Sede asignada'}</dd></div>
        </dl>
      </div>
    </Modal>
    {loading && <div className={styles.loadingOverlay}><RotateCw /><span>Actualizando calendario</span></div>}
  </section>;
}
