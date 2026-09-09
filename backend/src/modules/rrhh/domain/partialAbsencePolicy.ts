import { parseClockMinutes } from '../../../core/utils/time';

export type PartialAbsenceSchedule = {
  startTime: string;
  endTime: string;
  lunchEnabled: boolean;
  lunchStartFrom: string | null;
  lunchDurationMinutes: number;
  entryToleranceMinutes?: number;
  returnToleranceMinutes?: number;
};

export type PartialAbsenceMarks = {
  entry: number;
  lunchOut: number | null;
  lunchReturn: number | null;
  exit: number;
};

type MinuteRange = { start: number; end: number };

export type PartialAbsenceCalculation = {
  scheduledMinutes: number;
  coveredScheduledMinutes: number;
  missedMinutes: number;
};

function validRange(start: number, end: number): MinuteRange | null {
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

export function scheduledWorkRanges(schedule: PartialAbsenceSchedule): MinuteRange[] {
  const start = parseClockMinutes(schedule.startTime);
  const end = parseClockMinutes(schedule.endTime);
  if (end <= start) throw new Error('La jornada debe iniciar y terminar el mismo día.');
  if (!schedule.lunchEnabled || !schedule.lunchStartFrom || schedule.lunchDurationMinutes <= 0) {
    return [{ start, end }];
  }

  const lunchStart = parseClockMinutes(schedule.lunchStartFrom);
  const lunchEnd = lunchStart + schedule.lunchDurationMinutes;
  if (lunchStart <= start || lunchEnd >= end) {
    throw new Error('El descanso debe estar contenido dentro de la jornada.');
  }
  return [{ start, end: lunchStart }, { start: lunchEnd, end }];
}

function workedRanges(marks: PartialAbsenceMarks): MinuteRange[] {
  const entry = Math.max(0, Math.min(1439, Math.trunc(marks.entry)));
  const exit = Math.max(0, Math.min(1439, Math.trunc(marks.exit)));
  if (exit <= entry) throw new Error('La salida debe ser posterior a la entrada.');

  if (marks.lunchOut === null && marks.lunchReturn === null) return [{ start: entry, end: exit }];
  if (marks.lunchOut === null || marks.lunchReturn === null) {
    throw new Error('Las marcaciones de almuerzo deben estar completas.');
  }
  const lunchOut = Math.trunc(marks.lunchOut);
  const lunchReturn = Math.trunc(marks.lunchReturn);
  if (lunchOut <= entry || lunchReturn <= lunchOut || exit <= lunchReturn) {
    throw new Error('Las marcaciones no conservan un orden cronológico válido.');
  }
  return [{ start: entry, end: lunchOut }, { start: lunchReturn, end: exit }];
}

function overlapMinutes(left: MinuteRange, right: MinuteRange): number {
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
}

export function calculatePartialAbsence(
  schedule: PartialAbsenceSchedule,
  marks: PartialAbsenceMarks,
): PartialAbsenceCalculation {
  const scheduled = scheduledWorkRanges(schedule);
  const worked = workedRanges(marks);
  const scheduledMinutes = scheduled.reduce((total, range) => total + range.end - range.start, 0);
  const scheduleSpan = { start: parseClockMinutes(schedule.startTime), end: parseClockMinutes(schedule.endTime) };
  let coveredScheduledMinutes = marks.lunchOut !== null && marks.lunchReturn !== null
    ? worked.reduce((total, workedRange) => total + overlapMinutes(scheduleSpan, workedRange), 0)
    : scheduled.reduce((total, scheduledRange) => (
        total + worked.reduce((covered, workedRange) => covered + overlapMinutes(scheduledRange, workedRange), 0)
      ), 0);

  const entryDelay = Math.max(0, marks.entry - scheduleSpan.start);
  const entryTolerance = Math.max(0, Math.trunc(schedule.entryToleranceMinutes ?? 0));
  if (entryDelay > 0 && entryDelay <= entryTolerance) coveredScheduledMinutes += entryDelay;

  if (marks.lunchOut !== null && marks.lunchReturn !== null) {
    const excessBreak = Math.max(0, marks.lunchReturn - marks.lunchOut - schedule.lunchDurationMinutes);
    const returnTolerance = Math.max(0, Math.trunc(schedule.returnToleranceMinutes ?? 0));
    if (excessBreak > 0 && excessBreak <= returnTolerance) coveredScheduledMinutes += excessBreak;
  }
  const boundedCoverage = Math.min(scheduledMinutes, coveredScheduledMinutes);
  return {
    scheduledMinutes,
    coveredScheduledMinutes: boundedCoverage,
    missedMinutes: Math.max(0, scheduledMinutes - boundedCoverage),
  };
}

export function scheduledMinutesBefore(
  schedule: PartialAbsenceSchedule,
  currentMinutes: number,
): number {
  const current = Math.max(0, Math.min(1439, Math.trunc(currentMinutes)));
  return scheduledWorkRanges(schedule).reduce((total, range) => (
    total + Math.max(0, Math.min(current, range.end) - range.start)
  ), 0);
}
