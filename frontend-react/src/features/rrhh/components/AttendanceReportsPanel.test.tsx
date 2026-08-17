import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAttendanceWorkbook } from '../reports/attendance-excel-report';
import { rrhhService } from '../rrhh.service';
import type { AttendanceDashboard, Employee } from '../types';
import { AttendanceReportsPanel } from './AttendanceReportsPanel';

vi.mock('../rrhh.service', () => ({
  rrhhService: {
    getAttendanceDashboard: vi.fn(),
    getAttendanceTrend: vi.fn(),
    getAbsenceWorkflows: vi.fn(),
  },
}));

vi.mock('../reports/attendance-excel-report', () => ({
  exportAttendanceWorkbook: vi.fn(),
}));

const dashboard: AttendanceDashboard = {
  date: '2026-08-17',
  scope: 'EMPRESA',
  site_id: null,
  work_day: null,
  summary: {
    total_employees: 2,
    present: 2,
    on_time: 1,
    late: 1,
    without_record: 0,
    authorized_absence: 0,
    non_working: 0,
    completed: 1,
    overtime_minutes: 15,
  },
  employees: [
    {
      employee_id: 1,
      site_id: 2,
      site_name: 'Chanchamayo',
      employee_code: 'MYG-001',
      names: 'Carlos',
      last_names: 'Ramírez',
      job_role: 'Repartidor',
      attendance_id: 10,
      status: 'PRESENTE',
      delay_minutes: 0,
      overtime_minutes: 15,
      schedule: null,
      marks: { entry: '2026-08-17T13:55:00.000Z', lunch_out: null, lunch_return: null, exit: null },
    },
    {
      employee_id: 2,
      site_id: 3,
      site_name: 'Satipo',
      employee_code: 'MYG-002',
      names: 'María',
      last_names: 'López',
      job_role: 'Atención al cliente',
      attendance_id: 11,
      status: 'TARDANZA',
      delay_minutes: 12,
      overtime_minutes: 0,
      schedule: null,
      marks: { entry: '2026-08-17T14:12:00.000Z', lunch_out: null, lunch_return: null, exit: null },
    },
  ],
};

const directory: Employee[] = dashboard.employees.map((item, index) => ({
  id: item.employee_id,
  codigoEmpleado: item.employee_code,
  sedeId: item.site_id,
  cargoId: index + 1,
  dni: `7000000${index}`,
  nombres: item.names,
  apellidos: item.last_names,
  sexo: index === 0 ? 'M' : 'F',
  telefono: null,
  email: null,
  fechaIngreso: '2026-01-01',
  tipoRastreo: 'SOLO_MARCACION',
  estado: 'ACTIVO',
  observaciones: null,
  cargoNombre: item.job_role,
  sedeNombre: item.site_name,
}));

describe('AttendanceReportsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rrhhService.getAttendanceDashboard).mockResolvedValue(dashboard);
    vi.mocked(rrhhService.getAttendanceTrend).mockResolvedValue([]);
    vi.mocked(rrhhService.getAbsenceWorkflows).mockResolvedValue({ permissions: [], vacations: [] });
    vi.mocked(exportAttendanceWorkbook).mockResolvedValue(undefined);
  });

  it('filtra los registros y exporta un XLSX con el mismo alcance visible', async () => {
    render(<AttendanceReportsPanel siteId={null} employees={directory} />);

    expect(await screen.findByText('Carlos Ramírez')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar reporte por estado' }), { target: { value: 'TARDANZA' } });
    expect(screen.queryByText('Carlos Ramírez')).not.toBeInTheDocument();
    expect(screen.getByText('María López')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Exportar Excel/i }));
    await waitFor(() => expect(exportAttendanceWorkbook).toHaveBeenCalledOnce());
    const exported = vi.mocked(exportAttendanceWorkbook).mock.calls.at(0)?.[0];
    expect(exported).toBeDefined();
    expect(exported?.attendance.employees).toHaveLength(1);
    expect(exported?.attendance.employees[0]?.status).toBe('TARDANZA');
  });

  it('permite buscar por sede o cargo', async () => {
    render(<AttendanceReportsPanel siteId={null} employees={directory} />);
    await screen.findByText('Carlos Ramírez');

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar colaborador en el reporte' }), { target: { value: 'Satipo' } });
    expect(screen.queryByText('Carlos Ramírez')).not.toBeInTheDocument();
    expect(screen.getByText('María López')).toBeInTheDocument();
  });
});
