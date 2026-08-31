import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  WandSparkles,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button/Button';
import { Modal } from '../../../components/ui/Modal/Modal';
import { rrhhService } from '../rrhh.service';
import type { AttendanceCorrectionInput, AttendanceDashboardEmployee } from '../types';
import { formatDurationMinutes } from './attendance-formatters';
import styles from '../Rrhh.module.css';

type Props = {
  siteId: number;
  date: string;
  employee: AttendanceDashboardEmployee | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type CorrectionStatus = AttendanceCorrectionInput['status'];
type ClockType = keyof AttendanceCorrectionInput['marks'];
type ClockPeriod = 'AM' | 'PM';
type ClockDraft = { time: string; period: ClockPeriod };
type ClockDrafts = Record<ClockType, ClockDraft>;

const EMPTY_MARKS: AttendanceCorrectionInput['marks'] = {
  ENTRADA: null,
  SALIDA_ALMUERZO: null,
  REGRESO: null,
  SALIDA: null,
};

const statusOptions: Array<{ value: CorrectionStatus; label: string }> = [
  { value: 'PRESENTE', label: 'Asistencia' },
  { value: 'FALTA', label: 'Falta' },
  { value: 'PERMISO', label: 'Permiso' },
  { value: 'VACACIONES', label: 'Vacaciones' },
];

const clockTypes: Array<{ key: ClockType; label: string; step: string }> = [
  { key: 'ENTRADA', label: 'Entrada', step: 'Inicio de jornada' },
  { key: 'SALIDA_ALMUERZO', label: 'Salida a almuerzo', step: 'Inicio del descanso' },
  { key: 'REGRESO', label: 'Regreso', step: 'Fin del descanso' },
  { key: 'SALIDA', label: 'Salida final', step: 'Cierre de jornada' },
];

function localClock(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return `${parts.find(part => part.type === 'hour')?.value}:${parts.find(part => part.type === 'minute')?.value}`;
}

function formatOperationalDate(value: string) {
  const parsed = new Date(`${value}T12:00:00-05:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(parsed);
}

function clockMinutes(value: string | null) {
  if (!value) return null;
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function isValidClock(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeClockInput(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const parts = clean.includes(':') ? clean.split(':') : [];
  let hours: number;
  let minutes: number;

  if (parts.length === 2) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
  } else {
    const digits = clean.replace(/\D/g, '');
    if (!digits || digits.length > 4) return clean;
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

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return clean;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeTwelveHourInput(value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const parts = clean.includes(':') ? clean.split(':') : [];
  let hours: number;
  let minutes: number;

  if (parts.length === 2) {
    hours = Number(parts[0]);
    minutes = Number(parts[1]);
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

function toTwelveHourDraft(value: string | null, fallbackPeriod: ClockPeriod): ClockDraft {
  if (!value || !isValidClock(value)) return { time: '', period: fallbackPeriod };
  const [hourText, minuteText] = value.split(':');
  const hours = Number(hourText);
  return {
    time: `${hours % 12 || 12}:${minuteText}`,
    period: hours >= 12 ? 'PM' : 'AM',
  };
}

function draftsFromMarks(marks: AttendanceCorrectionInput['marks']): ClockDrafts {
  return {
    ENTRADA: toTwelveHourDraft(marks.ENTRADA, 'AM'),
    SALIDA_ALMUERZO: toTwelveHourDraft(marks.SALIDA_ALMUERZO, 'PM'),
    REGRESO: toTwelveHourDraft(marks.REGRESO, 'PM'),
    SALIDA: toTwelveHourDraft(marks.SALIDA, 'PM'),
  };
}

function parseClockDrafts(drafts: ClockDrafts) {
  const marks: AttendanceCorrectionInput['marks'] = { ...EMPTY_MARKS };
  for (const { key, label } of clockTypes) {
    const draft = drafts[key];
    if (!draft.time.trim()) continue;
    const value = toTwentyFourHour(draft.time, draft.period);
    if (!value) {
      return {
        marks: null,
        error: `Revisa la hora de ${label.toLowerCase()}. Escribe, por ejemplo, 9:00 y selecciona a. m. o p. m.`,
      };
    }
    marks[key] = value;
  }
  return { marks, error: null };
}

function addClockMinutes(value: string, minutesToAdd: number) {
  const normalized = normalizeClockInput(value);
  if (!normalized || !isValidClock(normalized)) return null;
  const total = (clockMinutes(normalized) ?? 0) + minutesToAdd;
  const bounded = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`;
}

function validateCorrection(
  status: CorrectionStatus,
  marks: AttendanceCorrectionInput['marks'],
  reason: string,
) {
  const cleanReason = reason.trim();
  if (cleanReason.length < 8) return 'Escribe un motivo claro de al menos 8 caracteres.';
  if (status !== 'PRESENTE') return null;
  if (!marks.ENTRADA) return 'Registra la hora de entrada para confirmar una asistencia.';
  for (const { key, label } of clockTypes) {
    if (marks[key] && !isValidClock(marks[key])) return `Revisa la hora de ${label.toLowerCase()}.`;
  }
  if (marks.REGRESO && !marks.SALIDA_ALMUERZO) return 'No puede existir un regreso sin salida a almuerzo.';
  if (marks.SALIDA_ALMUERZO && marks.SALIDA && !marks.REGRESO) {
    return 'Registra el regreso del almuerzo antes de la salida final.';
  }

  let previous: number | null = null;
  for (const { key } of clockTypes) {
    const current = clockMinutes(marks[key]);
    if (current === null) continue;
    if (previous !== null && current <= previous) return 'Las horas deben mantener el orden cronológico de la jornada.';
    previous = current;
  }
  return null;
}

export function AttendanceCorrectionModal({ siteId, date, employee, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<CorrectionStatus>('PRESENTE');
  const [reason, setReason] = useState('');
  const [clockDrafts, setClockDrafts] = useState<ClockDrafts>(() => draftsFromMarks(EMPTY_MARKS));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!employee) return;
    const effectiveStatus = employee.status === 'TARDANZA' ? 'PRESENTE' : employee.status;
    const editableStatus = statusOptions.some(option => option.value === effectiveStatus)
      ? effectiveStatus as CorrectionStatus
      : 'PRESENTE';
    setStatus(editableStatus);
    setReason('');
    setError(null);
    setClockDrafts(draftsFromMarks({
      ENTRADA: localClock(employee.marks.entry) || null,
      SALIDA_ALMUERZO: localClock(employee.marks.lunch_out) || null,
      REGRESO: localClock(employee.marks.lunch_return) || null,
      SALIDA: localClock(employee.marks.exit) || null,
    }));
  }, [employee]);

  const employeeName = `${employee?.names ?? ''} ${employee?.last_names ?? ''}`.trim();
  const initials = `${employee?.names.charAt(0) ?? ''}${employee?.last_names.charAt(0) ?? ''}`.toUpperCase();
  const hasMarks = status === 'PRESENTE';
  const normalizedReason = reason.trim();
  const parsedClocks = useMemo(() => parseClockDrafts(clockDrafts), [clockDrafts]);
  const currentValidation = useMemo(() => (
    parsedClocks.error ?? validateCorrection(status, parsedClocks.marks ?? EMPTY_MARKS, reason)
  ), [parsedClocks, reason, status]);

  const automaticResult = useMemo(() => {
    const schedule = employee?.schedule;
    const entry = parsedClocks.marks?.ENTRADA;
    if (status !== 'PRESENTE' || !schedule || !entry) return null;
    const difference = Math.max(0, (clockMinutes(entry) ?? 0) - (clockMinutes(schedule.start_time) ?? 0));
    const isLate = difference > schedule.tolerance_minutes;
    const tolerance = schedule.tolerance_minutes > 0
      ? `tolerancia ${formatDurationMinutes(schedule.tolerance_minutes)}`
      : 'sin tolerancia';
    return {
      label: isLate ? `Tardanza · ${formatDurationMinutes(difference)}` : 'Ingreso puntual',
      detail: `Entrada ${entry} · ${tolerance}`,
      late: isLate,
    };
  }, [employee?.schedule, parsedClocks.marks, status]);

  const changeStatus = (nextStatus: CorrectionStatus) => {
    setStatus(nextStatus);
    setError(null);
  };

  const updateClock = (key: ClockType, value: string) => {
    const clean = value.replace(/[^\d:]/g, '').slice(0, 5);
    setClockDrafts(current => ({ ...current, [key]: { ...current[key], time: clean } }));
    setError(null);
  };

  const normalizeClock = (key: ClockType) => {
    setClockDrafts(current => {
      const normalized = normalizeTwelveHourInput(current[key].time);
      return normalized ? { ...current, [key]: { ...current[key], time: normalized } } : current;
    });
  };

  const updateClockPeriod = (key: ClockType, period: ClockPeriod) => {
    setClockDrafts(current => ({ ...current, [key]: { ...current[key], period } }));
    setError(null);
  };

  const applyScheduledHours = () => {
    if (!employee?.schedule) return;
    const entry = normalizeClockInput(employee.schedule.start_time.slice(0, 5));
    const lunchOut = employee.schedule.lunch_enabled && employee.schedule.lunch_start_from
      ? normalizeClockInput(employee.schedule.lunch_start_from.slice(0, 5))
      : null;
    setClockDrafts(draftsFromMarks({
      ENTRADA: entry,
      SALIDA_ALMUERZO: lunchOut,
      REGRESO: lunchOut ? addClockMinutes(lunchOut, employee.schedule.lunch_duration_minutes) : null,
      SALIDA: normalizeClockInput(employee.schedule.end_time.slice(0, 5)),
    }));
    setError(null);
  };

  const clearHours = () => {
    setClockDrafts(draftsFromMarks(EMPTY_MARKS));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!employee) return;
    const parsed = parseClockDrafts(clockDrafts);
    if (parsed.error || !parsed.marks) {
      setError(parsed.error ?? 'Revisa las horas ingresadas.');
      return;
    }
    const validationError = validateCorrection(status, parsed.marks, reason);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await rrhhService.correctAttendance({
        sede_id: siteId,
        employee_id: employee.employee_id,
        date,
        status,
        reason: normalizedReason,
        marks: hasMarks ? parsed.marks : EMPTY_MARKS,
      });
      await onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo aplicar la corrección.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(employee)}
      onClose={saving ? () => undefined : onClose}
      title="Corregir asistencia"
      description="Ajuste administrativo con trazabilidad"
      icon={<ClipboardCheck />}
      headerAccessory={<span className={styles.correctionAuditBadge}><ShieldCheck /> Auditable</span>}
      maxWidth={760}
      className={styles.correctionDialog}
      footer={(
        <div className={styles.correctionFooter}>
          <p><ShieldCheck /> El cambio conservará el antes, el después y el usuario responsable.</p>
          <div>
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" form="attendance-correction" variant="corporate" icon={<CheckCircle2 />} loading={saving}>
              Aplicar corrección
            </Button>
          </div>
        </div>
      )}
    >
      <form id="attendance-correction" className={styles.correctionForm} onSubmit={submit} noValidate>
        <section className={styles.correctionEmployee} aria-label="Colaborador seleccionado">
          <span className={styles.correctionAvatar}>{initials || <UserRound />}</span>
          <div>
            <strong>{employeeName}</strong>
            <p>{employee?.job_role} <i /> {employee?.site_name}</p>
          </div>
          <div className={styles.correctionDate}>
            <CalendarDays />
            <span><small>Fecha operativa</small><strong>{formatOperationalDate(date)}</strong></span>
          </div>
        </section>

        {error && <div className={styles.correctionError} role="alert"><TriangleAlert /> <span>{error}</span></div>}

        <section className={styles.correctionSection}>
          <header className={styles.correctionSectionHeader}>
            <span><ClipboardCheck /></span>
            <div><h3>Resultado de asistencia</h3><p>Selecciona el estado que quedará registrado para esta fecha.</p></div>
          </header>
          <div className={styles.correctionStatusOptions} role="group" aria-label="Estado corregido">
            {statusOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={status === option.value ? styles.correctionStatusActive : ''}
                data-status={option.value.toLowerCase()}
                aria-pressed={status === option.value}
                onClick={() => changeStatus(option.value)}
              >
                <i />{option.label}
              </button>
            ))}
          </div>
          {automaticResult && (
            <div className={styles.correctionAutomaticResult} data-late={automaticResult.late}>
              <Clock3 />
              <span><strong>{automaticResult.label}</strong><small>{automaticResult.detail}</small></span>
              <ShieldCheck />
            </div>
          )}
        </section>

        {hasMarks ? (
          <section className={styles.correctionSection}>
            <header className={styles.correctionSectionHeader}>
              <span><Clock3 /></span>
              <div>
                <h3>Marcaciones corregidas</h3>
                <p>
                  Registra únicamente las horas verificadas.
                </p>
              </div>
              <div className={styles.correctionClockActions}>
                {employee?.schedule && <button type="button" onClick={applyScheduledHours}><WandSparkles /> Usar horario</button>}
                <button type="button" onClick={clearHours}><RotateCcw /> Limpiar</button>
              </div>
            </header>
            <div className={styles.correctionClocks}>
              {clockTypes.map(({ key, label, step }, index) => (
                <label key={key}>
                  <span><b>{index + 1}</b><span>{label}<small>{step}</small></span></span>
                  <div>
                    <Clock3 />
                    <input
                      aria-label={`${label}: hora`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={5}
                      placeholder="9:00"
                      value={clockDrafts[key].time}
                      onChange={event => updateClock(key, event.target.value)}
                      onBlur={() => normalizeClock(key)}
                    />
                    <select
                      aria-label={`${label}: periodo`}
                      value={clockDrafts[key].period}
                      onChange={event => updateClockPeriod(key, event.target.value as ClockPeriod)}
                    >
                      <option value="AM">a. m.</option>
                      <option value="PM">p. m.</option>
                    </select>
                  </div>
                </label>
              ))}
            </div>
          </section>
        ) : (
          <div className={styles.correctionNotice}>
            <TriangleAlert />
            <div><strong>Este estado no utiliza marcaciones horarias</strong><p>Las horas actuales se retirarán del registro operativo, pero permanecerán en el historial de auditoría.</p></div>
          </div>
        )}

        <section className={styles.correctionSection}>
          <header className={styles.correctionSectionHeader}>
            <span><FileText /></span>
            <div><h3>Sustento de la corrección</h3><p>Registra el documento, evidencia o circunstancia que autoriza el cambio.</p></div>
          </header>
          <label className={styles.correctionReason}>
            <span>Motivo obligatorio <small>{reason.length}/500</small></span>
            <textarea
              aria-label="Motivo de la corrección"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={event => { setReason(event.target.value); setError(null); }}
              placeholder="Ej.: Regularización autorizada según reporte del encargado de sede..."
            />
            <small data-valid={!currentValidation || normalizedReason.length >= 8}>Mínimo 8 caracteres. Este texto formará parte de la auditoría.</small>
          </label>
        </section>
      </form>
    </Modal>
  );
}
