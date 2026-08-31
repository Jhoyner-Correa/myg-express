import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkSchedule } from '../types';
import { ScheduleEditorModal } from './ScheduleEditorModal';

const schedule: WorkSchedule = {
  id: 1,
  version_id: 2,
  version: 2,
  name: 'Horario de oficina',
  status: 'ACTIVO',
  start_time: '09:00:00',
  end_time: '20:00:00',
  tolerance_minutes: 10,
  lunch_enabled: true,
  lunch_start_from: '13:00:00',
  lunch_start_until: '16:00:00',
  lunch_duration_minutes: 180,
  return_tolerance_minutes: 5,
  entry_open_before_minutes: 60,
  lunch_open_before_minutes: 30,
  return_open_before_minutes: 30,
  exit_open_before_minutes: 30,
  overtime_threshold_minutes: 10,
  effective_from: '2026-08-14',
  effective_until: null,
};

describe('ScheduleEditorModal', () => {
  it('presenta las horas en formato de 12 horas y calcula el descanso', () => {
    render(<ScheduleEditorModal schedule={schedule} saving={false} onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByLabelText('Entrada: hora')).toHaveValue('9:00');
    expect(screen.getByLabelText('Entrada: periodo')).toHaveValue('AM');
    expect(screen.getByLabelText('Salida al almuerzo: hora')).toHaveValue('1:00');
    expect(screen.getByLabelText('Salida al almuerzo: periodo')).toHaveValue('PM');
    expect(screen.getByLabelText('Regreso del almuerzo: hora')).toHaveValue('4:00');
    expect(screen.getByText('3 horas de descanso')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /duración/i })).not.toBeInTheDocument();
  });

  it('envía al backend la duración derivada de salida y regreso', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ScheduleEditorModal schedule={schedule} saving={false} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Regreso del almuerzo: hora'), { target: { value: '2:00' } });
    fireEvent.blur(screen.getByLabelText('Regreso del almuerzo: hora'));
    fireEvent.click(screen.getByRole('button', { name: 'Programar actualización' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      lunch_start_from: '13:00',
      lunch_start_until: '14:00',
      lunch_duration_minutes: 60,
    })));
  });
});
