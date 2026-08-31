import { assertDateOnly, parseClockMinutes } from '../../../core/utils/time';

export type SchedulePolicyInput = {
  name: unknown;
  startTime: unknown;
  endTime: unknown;
  toleranceMinutes: unknown;
  lunchEnabled: unknown;
  lunchStartFrom: unknown;
  lunchStartUntil: unknown;
  lunchDurationMinutes: unknown;
  returnToleranceMinutes: unknown;
  entryOpenBeforeMinutes: unknown;
  lunchOpenBeforeMinutes: unknown;
  returnOpenBeforeMinutes: unknown;
  exitOpenBeforeMinutes: unknown;
  overtimeThresholdMinutes: unknown;
  effectiveFrom: unknown;
};

export type NormalizedSchedulePolicy = {
  name: string;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
  lunchEnabled: boolean;
  lunchStartFrom: string | null;
  lunchStartUntil: string | null;
  lunchDurationMinutes: number;
  returnToleranceMinutes: number;
  entryOpenBeforeMinutes: number;
  lunchOpenBeforeMinutes: number;
  returnOpenBeforeMinutes: number;
  exitOpenBeforeMinutes: number;
  overtimeThresholdMinutes: number;
  effectiveFrom: string;
};

export type WeeklyScope = 'EMPRESA' | 'SEDE' | 'EMPLEADO';

export function weeklyScopePriority(scope: WeeklyScope): number {
  return scope === 'EMPLEADO' ? 3 : scope === 'SEDE' ? 2 : 1;
}

export function normalizeWeeklyAssignments(
  assignments: Array<{ weekday: unknown; scheduleId: unknown }>,
) {
  if (!Array.isArray(assignments) || assignments.length > 7) {
    throw new Error('La asignación semanal no es válida.');
  }
  const normalized = assignments.map(value => ({
    weekday: Number(value.weekday),
    scheduleId: Number(value.scheduleId),
  }));
  if (normalized.some(value => !Number.isInteger(value.weekday) || value.weekday < 1 || value.weekday > 7
    || !Number.isInteger(value.scheduleId) || value.scheduleId < 1)) {
    throw new Error('Cada día y horario asignado debe ser válido.');
  }
  if (new Set(normalized.map(value => value.weekday)).size !== normalized.length) {
    throw new Error('No puedes asignar dos horarios al mismo día.');
  }
  return normalized.sort((left, right) => left.weekday - right.weekday);
}

function name(value: unknown) {
  const normalized = String(value || '').trim();
  if (normalized.length < 2 || normalized.length > 100) {
    throw new Error('El nombre del horario debe tener entre 2 y 100 caracteres.');
  }
  return normalized;
}

function clock(value: unknown, label: string): string {
  const raw = String(value || '').trim();
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
    throw new Error(`${label} debe usar el formato HH:mm.`);
  }
  return `${match[1]}:${match[2]}:00`;
}

function integer(value: unknown, label: string, minimum: number, maximum: number) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new Error(`${label} debe estar entre ${minimum} y ${maximum} minutos.`);
  }
  return normalized;
}

export function normalizeSchedulePolicy(input: SchedulePolicyInput): NormalizedSchedulePolicy {
  const startTime = clock(input.startTime, 'La hora de entrada');
  const endTime = clock(input.endTime, 'La hora de salida');
  const start = parseClockMinutes(startTime);
  const end = parseClockMinutes(endTime);
  if (end <= start) throw new Error('Por ahora los horarios deben iniciar y terminar el mismo día.');

  const lunchEnabled = input.lunchEnabled === true || input.lunchEnabled === 1 || input.lunchEnabled === '1';
  let lunchStartFrom: string | null = null;
  let lunchStartUntil: string | null = null;
  let lunchDurationMinutes = 0;
  let returnToleranceMinutes = 0;
  if (lunchEnabled) {
    lunchStartFrom = clock(input.lunchStartFrom, 'La salida al almuerzo');
    lunchStartUntil = clock(input.lunchStartUntil, 'El regreso del almuerzo');
    returnToleranceMinutes = integer(input.returnToleranceMinutes, 'La tolerancia de regreso', 0, 120);
    const from = parseClockMinutes(lunchStartFrom);
    const until = parseClockMinutes(lunchStartUntil);
    lunchDurationMinutes = until - from;
    if (from <= start || until >= end || lunchDurationMinutes < 15 || lunchDurationMinutes > 300) {
      throw new Error('La salida y el regreso del almuerzo deben estar dentro de la jornada y definir un descanso de 15 minutos a 5 horas.');
    }
  }

  return {
    name: name(input.name),
    startTime,
    endTime,
    toleranceMinutes: integer(input.toleranceMinutes, 'La tolerancia de entrada', 0, 180),
    lunchEnabled,
    lunchStartFrom,
    lunchStartUntil,
    lunchDurationMinutes,
    returnToleranceMinutes,
    entryOpenBeforeMinutes: integer(input.entryOpenBeforeMinutes ?? 60, 'La anticipacion de entrada', 0, 180),
    lunchOpenBeforeMinutes: integer(input.lunchOpenBeforeMinutes ?? 30, 'La anticipacion de almuerzo', 0, 120),
    returnOpenBeforeMinutes: integer(input.returnOpenBeforeMinutes ?? 30, 'La anticipacion de regreso', 0, 120),
    exitOpenBeforeMinutes: integer(input.exitOpenBeforeMinutes ?? 30, 'La anticipacion de salida', 0, 180),
    overtimeThresholdMinutes: integer(input.overtimeThresholdMinutes ?? 10, 'El umbral de sobretiempo', 1, 180),
    effectiveFrom: assertDateOnly(input.effectiveFrom),
  };
}

export function previousDate(date: string) {
  const value = new Date(`${assertDateOnly(date)}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
