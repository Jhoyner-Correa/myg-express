import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rrhhService } from '../rrhh.service';
import type { AttendanceDashboardEmployee } from '../types';
import { AttendanceCorrectionModal } from './AttendanceCorrectionModal';

vi.mock('../rrhh.service', () => ({ rrhhService: { correctAttendance: vi.fn() } }));

const employee: AttendanceDashboardEmployee = {
  employee_id: 43,
  site_id: 3,
  site_name: 'Satipo',
  employee_code: 'MYG-43',
  names: 'Jhoyner Alexander',
  last_names: 'Correa Hinostroza',
  job_role: 'Encargado de oficina',
  attendance_id: null,
  status: 'SIN_REGISTRO',
  delay_minutes: 0,
  return_delay_minutes: 0,
  overtime_minutes: 0,
  operational_status: 'PENDIENTE_ENTRADA',
  next_action: 'MARCAR_ENTRADA',
  requires_attention: false,
  completed_marks: 0,
  expected_marks: 2,
  schedule: null,
  marks: { entry: null, lunch_out: null, lunch_return: null, exit: null },
};

describe('AttendanceCorrectionModal', () => {
  beforeEach(() => {
    vi.mocked(rrhhService.correctAttendance).mockClear();
    vi.mocked(rrhhService.correctAttendance).mockResolvedValue({ correction_id: 1, attendance_id: 2 });
  });

  it('exige una entrada para registrar presencia y envía un motivo auditable', async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<AttendanceCorrectionModal siteId={3} date="2026-08-19" employee={employee} onClose={onClose} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('Motivo de la corrección'), { target: { value: 'Corrección sustentada por RR. HH.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar corrección' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Registra la hora de entrada');
    expect(rrhhService.correctAttendance).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Entrada: hora'), { target: { value: '900' } });
    fireEvent.blur(screen.getByLabelText('Entrada: hora'));
    expect(screen.getByLabelText('Entrada: hora')).toHaveValue('9:00');
    expect(screen.getByLabelText('Entrada: periodo')).toHaveValue('AM');
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar corrección' }));

    await waitFor(() => expect(rrhhService.correctAttendance).toHaveBeenCalledWith(expect.objectContaining({
      sede_id: 3,
      employee_id: 43,
      status: 'PRESENTE',
      reason: 'Corrección sustentada por RR. HH.',
      marks: expect.objectContaining({ ENTRADA: '09:00' }),
    })));
    expect(rrhhService.correctAttendance).toHaveBeenCalledWith(expect.not.objectContaining({ delay_minutes: expect.anything() }));
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('explica que una ausencia retira las horas operativas', () => {
    render(<AttendanceCorrectionModal siteId={3} date="2026-08-19" employee={employee} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Falta' }));

    expect(screen.getByText('Este estado no utiliza marcaciones horarias')).toBeInTheDocument();
    expect(screen.queryByLabelText('Entrada: hora')).not.toBeInTheDocument();
  });

  it('convierte una hora de la tarde al formato canónico antes de enviarla', async () => {
    render(<AttendanceCorrectionModal siteId={3} date="2026-08-19" employee={employee} onClose={vi.fn()} onSaved={vi.fn().mockResolvedValue(undefined)} />);

    fireEvent.change(screen.getByLabelText('Motivo de la corrección'), { target: { value: 'Registro manual autorizado por RR. HH.' } });
    fireEvent.change(screen.getByLabelText('Entrada: hora'), { target: { value: '100' } });
    fireEvent.blur(screen.getByLabelText('Entrada: hora'));
    fireEvent.change(screen.getByLabelText('Entrada: periodo'), { target: { value: 'PM' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar corrección' }));

    await waitFor(() => expect(rrhhService.correctAttendance).toHaveBeenCalledWith(expect.objectContaining({
      marks: expect.objectContaining({ ENTRADA: '13:00' }),
    })));
  });

  it('muestra la tardanza calculada desde el horario y no pide minutos manuales', () => {
    render(<AttendanceCorrectionModal
      siteId={3}
      date="2026-08-19"
      employee={{
        ...employee,
        schedule: {
          name: 'Horario de oficina',
          start_time: '09:00:00',
          end_time: '20:00:00',
          tolerance_minutes: 0,
          lunch_enabled: true,
          lunch_start_from: '13:00:00',
          lunch_start_until: '16:00:00',
          lunch_duration_minutes: 180,
          return_tolerance_minutes: 0,
        },
      }}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />);

    fireEvent.change(screen.getByLabelText('Entrada: hora'), { target: { value: '1000' } });
    fireEvent.blur(screen.getByLabelText('Entrada: hora'));

    expect(screen.getByText('Tardanza · 1 h')).toBeInTheDocument();
    expect(screen.getByText('Entrada 10:00 · sin tolerancia')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Entrada: hora'), { target: { value: '1015' } });
    fireEvent.blur(screen.getByLabelText('Entrada: hora'));

    expect(screen.getByText('Tardanza · 1 h 15 min')).toBeInTheDocument();
    expect(screen.queryByLabelText('Minutos de tardanza')).not.toBeInTheDocument();
  });
});
