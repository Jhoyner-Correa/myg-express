import { parseClockMinutes } from '../../../core/utils/time';

export type AttendanceOperationalStatus =
  | 'NO_LABORABLE'
  | 'PERMISO'
  | 'VACACIONES'
  | 'FALTA'
  | 'PROGRAMADO'
  | 'PENDIENTE_ENTRADA'
  | 'ENTRADA_RETRASADA'
  | 'EN_JORNADA'
  | 'EN_ALMUERZO'
  | 'REGRESO_RETRASADO'
  | 'SALIDA_PENDIENTE'
  | 'JORNADA_COMPLETADA'
  | 'JORNADA_INCOMPLETA';

export type AttendanceNextAction =
  | 'NINGUNA'
  | 'MARCAR_ENTRADA'
  | 'MARCAR_SALIDA_ALMUERZO'
  | 'MARCAR_REGRESO'
  | 'MARCAR_SALIDA'
  | 'REVISAR_INCIDENCIA';

export type AttendanceOperationalResult = {
  operational_status: AttendanceOperationalStatus;
  next_action: AttendanceNextAction;
  requires_attention: boolean;
  completed_marks: number;
  expected_marks: 2 | 4;
};

type OperationalSchedule = {
  start_time: string;
  end_time: string;
  tolerance_minutes: number;
  lunch_enabled: boolean;
  lunch_start_from: string | null;
  lunch_duration_minutes: number;
  return_tolerance_minutes: number;
};

type OperationalMarks = {
  entry: Date | string | null;
  lunch_out: Date | string | null;
  lunch_return: Date | string | null;
  exit: Date | string | null;
};

export type AttendanceOperationalInput = {
  date: string;
  today: string;
  current_minutes: number;
  status: string;
  schedule: OperationalSchedule | null;
  marks: OperationalMarks;
};

function completedMarks(marks: OperationalMarks): number {
  return [marks.entry, marks.lunch_out, marks.lunch_return, marks.exit].filter(Boolean).length;
}

function fixed(
  operationalStatus: AttendanceOperationalStatus,
  marks: OperationalMarks,
  expectedMarks: 2 | 4,
): AttendanceOperationalResult {
  return {
    operational_status: operationalStatus,
    next_action: 'NINGUNA',
    requires_attention: false,
    completed_marks: completedMarks(marks),
    expected_marks: expectedMarks,
  };
}

/**
 * Deriva la situacion operativa sin reemplazar el estado laboral canonico.
 * El resultado es determinista y no modifica la asistencia almacenada.
 */
export function deriveAttendanceOperationalState(
  input: AttendanceOperationalInput,
): AttendanceOperationalResult {
  const expectedMarks: 2 | 4 = input.schedule?.lunch_enabled ? 4 : 2;
  const markCount = completedMarks(input.marks);

  if (input.status === 'NO_LABORABLE') return fixed('NO_LABORABLE', input.marks, expectedMarks);
  if (input.status === 'PERMISO') return fixed('PERMISO', input.marks, expectedMarks);
  if (input.status === 'VACACIONES') return fixed('VACACIONES', input.marks, expectedMarks);
  if (input.status === 'FALTA') {
    return { ...fixed('FALTA', input.marks, expectedMarks), requires_attention: true };
  }

  const isPast = input.date < input.today;
  const isFuture = input.date > input.today;
  if (!input.schedule) {
    return fixed('NO_LABORABLE', input.marks, expectedMarks);
  }

  if (isFuture) return fixed('PROGRAMADO', input.marks, expectedMarks);

  if (input.marks.exit) return fixed('JORNADA_COMPLETADA', input.marks, expectedMarks);

  if (isPast) {
    return {
      operational_status: markCount ? 'JORNADA_INCOMPLETA' : 'FALTA',
      next_action: 'REVISAR_INCIDENCIA',
      requires_attention: true,
      completed_marks: markCount,
      expected_marks: expectedMarks,
    };
  }

  const start = parseClockMinutes(input.schedule.start_time);
  const end = parseClockMinutes(input.schedule.end_time);
  const lateFrom = start + Math.max(0, input.schedule.tolerance_minutes);

  if (!input.marks.entry) {
    const delayed = input.current_minutes > lateFrom;
    return {
      operational_status: delayed ? 'ENTRADA_RETRASADA' : 'PENDIENTE_ENTRADA',
      next_action: 'MARCAR_ENTRADA',
      requires_attention: delayed,
      completed_marks: markCount,
      expected_marks: expectedMarks,
    };
  }

  if (input.schedule.lunch_enabled && input.marks.lunch_out && !input.marks.lunch_return) {
    const lunchStart = input.schedule.lunch_start_from
      ? parseClockMinutes(input.schedule.lunch_start_from)
      : start;
    const returnLimit = lunchStart
      + Math.max(0, input.schedule.lunch_duration_minutes)
      + Math.max(0, input.schedule.return_tolerance_minutes);
    const delayed = input.current_minutes > returnLimit;
    return {
      operational_status: delayed ? 'REGRESO_RETRASADO' : 'EN_ALMUERZO',
      next_action: 'MARCAR_REGRESO',
      requires_attention: delayed,
      completed_marks: markCount,
      expected_marks: expectedMarks,
    };
  }

  if (input.current_minutes >= end) {
    return {
      operational_status: 'SALIDA_PENDIENTE',
      next_action: 'MARCAR_SALIDA',
      requires_attention: true,
      completed_marks: markCount,
      expected_marks: expectedMarks,
    };
  }

  return {
    operational_status: 'EN_JORNADA',
    next_action: input.schedule.lunch_enabled && !input.marks.lunch_out
      ? 'MARCAR_SALIDA_ALMUERZO'
      : 'MARCAR_SALIDA',
    requires_attention: false,
    completed_marks: markCount,
    expected_marks: expectedMarks,
  };
}
