import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rrhhService } from '../rrhh.service';
import type { AttendanceDashboard } from '../types';
import { AttendancePanel } from './AttendancePanel';

vi.mock('../rrhh.service', () => ({
  rrhhService: {
    getAttendanceDashboard: vi.fn(),
    getBiometricContingencies: vi.fn(),
    getBiometricContingencyHistory: vi.fn(),
  },
}));

const corporateDashboard: AttendanceDashboard = {
  date: '2026-08-14',
  scope: 'EMPRESA',
  site_id: null,
  work_day: null,
  summary: {
    total_employees: 0,
    present: 0,
    on_time: 0,
    late: 0,
    without_record: 0,
    authorized_absence: 0,
    non_working: 0,
    completed: 0,
    overtime_minutes: 0,
  },
  employees: [],
};

describe('AttendancePanel', () => {
  beforeEach(() => {
    vi.mocked(rrhhService.getAttendanceDashboard).mockResolvedValue(corporateDashboard);
    vi.mocked(rrhhService.getBiometricContingencies).mockResolvedValue([]);
    vi.mocked(rrhhService.getBiometricContingencyHistory).mockResolvedValue([]);
  });

  it('renderiza el consolidado corporativo cuando no existe un único calendario de sede', async () => {
    render(<AttendancePanel siteId={null} canManage={false} />);

    expect(await screen.findByRole('heading', { name: 'Control diario de asistencia' })).toBeInTheDocument();
    expect(screen.queryByText('Personal programado')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sede de asistencia' })).toHaveValue('all');
    expect(await screen.findByText('Sin resultados')).toBeInTheDocument();
  });

  it('abre la bandeja de selfies como una opción compacta y comunica el estado vacío', async () => {
    render(<AttendancePanel siteId={null} canManage />);

    const trigger = await screen.findByRole('button', { name: 'Abrir revisión de selfies: 0 pendientes' });
    expect(screen.queryByText('No hay selfies pendientes')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Verificación por selfie' })).toBeInTheDocument();
    expect(screen.getByText('No hay selfies pendientes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial de verificaciones' }));

    expect(await screen.findByRole('dialog', { name: 'Historial de verificaciones' })).toBeInTheDocument();
    expect(screen.getByText('Sin verificaciones anteriores')).toBeInTheDocument();
    expect(rrhhService.getBiometricContingencyHistory).toHaveBeenCalledWith(null);
  });
});
