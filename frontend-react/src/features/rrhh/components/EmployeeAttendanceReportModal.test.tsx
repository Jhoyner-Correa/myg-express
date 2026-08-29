import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rrhhService } from '../rrhh.service';
import type { Employee, EmployeeAttendanceReport } from '../types';
import { EmployeeAttendanceReportModal } from './EmployeeAttendanceReportModal';

vi.mock('../rrhh.service', () => ({
  rrhhService: { getEmployeeAttendanceReport: vi.fn() },
}));

const employee: Employee = {
  id: 7,
  codigoEmpleado: 'MYG-007',
  sedeId: 2,
  cargoId: 3,
  dni: '70000007',
  ruc: null,
  nombres: 'Juanito',
  apellidos: 'Pérez Soto',
  sexo: 'M',
  telefono: null,
  email: null,
  direccion: 'Chanchamayo',
  foto: null,
  fechaIngreso: '2026-01-01',
  tipoRastreo: 'SOLO_MARCACION',
  estado: 'ACTIVO',
  observaciones: null,
  cargoNombre: 'Operador',
  sedeNombre: 'Chanchamayo',
};

const report: EmployeeAttendanceReport = {
  period: {
    mode: 'MONTH',
    anchor: '2026-08-28',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
  },
  employee: {
    id: employee.id,
    codigo_empleado: employee.codigoEmpleado,
    nombres: employee.nombres,
    apellidos: employee.apellidos,
    foto: null,
    cargo: 'Operador',
    sede_id: employee.sedeId,
    sede: 'Chanchamayo',
    fecha_ingreso: '2026-01-01',
    fecha_cese: null,
  },
  summary: {
    scheduled_days: 2,
    attended_days: 1,
    on_time_days: 1,
    late_days: 0,
    absent_days: 1,
    authorized_days: 0,
    without_record_days: 0,
    justified_incidents: 0,
    pending_justifications: 0,
    delay_minutes: 0,
    overtime_minutes: 35,
    attendance_rate: 50,
    punctuality_rate: 100,
  },
  days: [
    {
      date: '2026-08-03', status: 'PRESENTE', scheduled: true, is_future: false,
      attendance_id: 41, attendance_type: 'REGULAR', delay_minutes: 0,
      return_delay_minutes: 0, overtime_minutes: 35,
      marks: { entry: '09:00:00', lunch_out: '13:00:00', lunch_return: '14:00:00', exit: '20:35:00' },
      justification: null,
    },
    {
      date: '2026-08-04', status: 'FALTA', scheduled: true, is_future: false,
      attendance_id: 42, attendance_type: 'REGULAR', delay_minutes: 0,
      return_delay_minutes: 0, overtime_minutes: 0,
      marks: { entry: null, lunch_out: null, lunch_return: null, exit: null },
      justification: null,
    },
  ],
};

describe('EmployeeAttendanceReportModal', () => {
  beforeEach(() => {
    vi.mocked(rrhhService.getEmployeeAttendanceReport).mockImplementation(async (_site, _employee, mode) => ({
      ...report,
      period: { ...report.period, mode },
    }));
  });

  it('muestra el reporte mensual real del colaborador y permite cambiar a semana', async () => {
    render(<EmployeeAttendanceReportModal employees={[employee]} initialEmployeeId={employee.id} onClose={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'Historial de asistencia' })).toBeInTheDocument();
    expect(await screen.findByText('Juanito Pérez Soto')).toBeInTheDocument();
    expect(screen.getByText('35 min')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lunes, 3 de agosto: Asistencia puntual/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Semanal' }));
    await waitFor(() => expect(rrhhService.getEmployeeAttendanceReport).toHaveBeenLastCalledWith(
      employee.sedeId, employee.id, 'WEEK', expect.any(String), expect.any(AbortSignal),
    ));
  });
});
