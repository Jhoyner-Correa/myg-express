import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rrhhService } from '../rrhh.service';
import type { AttendanceDashboard } from '../types';
import { AttendancePanel } from './AttendancePanel';

vi.mock('../rrhh.service', () => ({
  rrhhService: {
    getAttendanceDashboard: vi.fn(),
    getBiometricContingencies: vi.fn(),
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
  });

  it('renderiza el consolidado corporativo cuando no existe un único calendario de sede', async () => {
    render(<AttendancePanel siteId={null} canManage={false} />);

    expect(await screen.findByRole('heading', { name: 'Asistencia diaria' })).toBeInTheDocument();
    expect(screen.getByText(/0 colaboradores/)).toBeInTheDocument();
  });
});
