import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { rrhhService } from '../rrhh.service';
import type { AbsenceWorkflows, WorkCalendarEvent } from '../types';
import styles from './AgendaPanel.module.css';

type Props = {
  siteId: number | null;
  workflows: AbsenceWorkflows | null;
  onOpenCalendar: () => void;
};

type AgendaEntry = {
  id: string;
  start: string;
  end: string;
  title: string;
  context: string;
  tone: 'blue' | 'orange' | 'violet';
};

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function currentMonth() {
  return `${businessToday().slice(0, 7)}-01`;
}

function shiftMonth(month: string, delta: number) {
  const value = new Date(`${month}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + delta);
  return value.toISOString().slice(0, 7) + '-01';
}

function monthRange(month: string) {
  const start = month.slice(0, 7) + '-01';
  const value = new Date(`${start}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1, 0);
  return { start, end: value.toISOString().slice(0, 10) };
}

function monthCells(month: string) {
  const { end } = monthRange(month);
  const first = new Date(`${month}T12:00:00Z`);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const totalDays = Number(end.slice(8, 10));
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - mondayOffset + 1;
    return day > 0 && day <= totalDays ? { day, date: `${month.slice(0, 8)}${String(day).padStart(2, '0')}` } : null;
  });
}

function monthLabel(month: string) {
  const text = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'America/Lima' }).format(new Date(`${month}T12:00:00-05:00`));
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', timeZone: 'America/Lima' }).format(new Date(`${date}T12:00:00-05:00`)).replace('.', '');
}

function calendarEntries(events: WorkCalendarEvent[]): AgendaEntry[] {
  return events.filter(event => event.status === 'ACTIVO').map(event => ({
    id: `calendar-${event.id}`,
    start: event.start_date,
    end: event.end_date,
    title: event.name,
    context: event.site_name ?? 'Alcance corporativo',
    tone: event.type === 'JORNADA_ESPECIAL' ? 'blue' : 'orange',
  }));
}

export function AgendaPanel({ siteId, workflows, onOpenCalendar }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [events, setEvents] = useState<WorkCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const today = businessToday();
  const cells = useMemo(() => monthCells(month), [month]);

  useEffect(() => {
    const controller = new AbortController();
    const range = monthRange(month);
    setLoading(true);
    setFailed(false);
    rrhhService.getWorkCalendar(siteId, range.start, range.end, controller.signal)
      .then(setEvents)
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month, siteId]);

  const entries = useMemo(() => {
    const permissions: AgendaEntry[] = (workflows?.permissions ?? [])
      .filter(item => item.estado === 'APROBADO')
      .map(item => ({ id: `permission-${item.id}`, start: item.fecha_inicio, end: item.fecha_fin, title: `Permiso: ${item.nombres} ${item.apellidos}`, context: item.sede_nombre, tone: 'blue' }));
    const vacations: AgendaEntry[] = (workflows?.vacations ?? [])
      .filter(item => ['APROBADA', 'PROGRAMADA', 'EN_CURSO'].includes(item.estado))
      .map(item => ({ id: `vacation-${item.id}`, start: item.fecha_inicio, end: item.fecha_fin, title: `Vacaciones: ${item.nombres} ${item.apellidos}`, context: item.sede_nombre, tone: 'violet' }));
    const range = monthRange(month);
    return [...calendarEntries(events), ...permissions, ...vacations]
      .filter(item => item.start <= range.end && item.end >= range.start)
      .sort((left, right) => left.start.localeCompare(right.start));
  }, [events, month, workflows]);

  const markedDates = useMemo(() => new Set(cells.flatMap(cell => cell && entries.some(entry => entry.start <= cell.date && entry.end >= cell.date) ? [cell.date] : [])), [cells, entries]);
  const upcoming = entries.filter(entry => entry.end >= today).slice(0, 3);

  return <article className={styles.card}>
    <header><div><CalendarDays /><h2>Agenda y próximos eventos</h2></div></header>
    <div className={styles.monthNav}><button type="button" aria-label="Mes anterior" onClick={() => setMonth(value => shiftMonth(value, -1))}><ChevronLeft /></button><strong>{monthLabel(month)}</strong><button type="button" aria-label="Mes siguiente" onClick={() => setMonth(value => shiftMonth(value, 1))}><ChevronRight /></button></div>
    <div className={styles.weekdays}>{WEEKDAYS.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
    <div className={styles.calendar}>{cells.map((cell, index) => cell ? <span key={cell.date} className={`${cell.date === today ? styles.today : ''} ${markedDates.has(cell.date) ? styles.marked : ''}`}>{cell.day}</span> : <span key={`empty-${index}`} />)}</div>
    <div className={styles.todayLabel}>Hoy · {new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' }).format(new Date(`${today}T12:00:00-05:00`))}</div>
    <div className={styles.events}>
      {loading && <p>Cargando agenda…</p>}
      {!loading && failed && <p>No se pudo consultar el calendario.</p>}
      {!loading && !failed && upcoming.map(entry => <div key={entry.id} className={styles.event}><i className={styles[entry.tone]} /><time>{dayLabel(entry.start)}</time><div><strong>{entry.title}</strong><span>{entry.context}</span></div></div>)}
      {!loading && !failed && !upcoming.length && <p>No hay eventos programados para este mes.</p>}
    </div>
    <footer><button type="button" onClick={onOpenCalendar}>Ver agenda completa <ArrowRight /></button></footer>
  </article>;
}
