import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttendanceReportInput } from './attendance-report-model';
import { buildAttendanceReportModel } from './attendance-report-model';
import { buildAttendanceWorkbook } from './attendance-excel-report';

function fixture(): AttendanceReportInput {
  return {
    attendance: {
      date: '2026-08-15',
      scope: 'EMPRESA',
      site_id: null,
      summary: { total_employees: 4, present: 2, on_time: 1, late: 1, without_record: 1, authorized_absence: 1, non_working: 0, completed: 1, overtime_minutes: 35 },
      work_day: { working: true, reason: 'REGULAR', name: null, scope: 'EMPRESA' },
      employees: [
        {
          employee_id: 1, site_id: 1, site_name: 'Chanchamayo', employee_code: 'MYG-01', names: 'Carlos', last_names: 'Ramírez', job_role: 'Repartidor', attendance_id: 1, status: 'PRESENTE', delay_minutes: 0, overtime_minutes: 35,
          schedule: { name: 'Oficina', start_time: '09:00:00', end_time: '18:00:00', lunch_enabled: true, lunch_start_from: '13:00:00', lunch_start_until: '14:00:00', lunch_duration_minutes: 60, return_tolerance_minutes: 5 },
          marks: { entry: '2026-08-15T08:55:00-05:00', lunch_out: '2026-08-15T13:00:00-05:00', lunch_return: '2026-08-15T14:00:00-05:00', exit: '2026-08-15T18:35:00-05:00' },
        },
        {
          employee_id: 2, site_id: 1, site_name: 'Chanchamayo', employee_code: 'MYG-02', names: 'María', last_names: 'López', job_role: 'Atención al cliente', attendance_id: 2, status: 'TARDANZA', delay_minutes: 18, overtime_minutes: 0, schedule: null,
          marks: { entry: '2026-08-15T09:18:00-05:00', lunch_out: null, lunch_return: null, exit: null },
        },
        {
          employee_id: 3, site_id: 2, site_name: 'Satipo', employee_code: 'MYG-03', names: 'Ana', last_names: 'Torres', job_role: 'Administración', attendance_id: null, status: 'SIN_REGISTRO', delay_minutes: 0, overtime_minutes: 0, schedule: null,
          marks: { entry: null, lunch_out: null, lunch_return: null, exit: null },
        },
        {
          employee_id: 4, site_id: 2, site_name: 'Satipo', employee_code: 'MYG-04', names: 'Sofía', last_names: 'Martínez', job_role: 'Almacén', attendance_id: null, status: 'VACACIONES', delay_minutes: 0, overtime_minutes: 0, schedule: null,
          marks: { entry: null, lunch_out: null, lunch_return: null, exit: null },
        },
      ],
    },
    trend: [{ date: '2026-08-15', working_employees: 4, present: 2, late: 1, absences: 1, authorized_absences: 1, attendance_rate: 50, tardiness_rate: 25 }],
    workflows: null,
    employees: [
      { id: 1, codigoEmpleado: 'MYG-01', sedeId: 1, cargoId: 1, dni: '12345678', nombres: 'Carlos', apellidos: 'Ramírez', sexo: 'M', telefono: null, email: null, fechaIngreso: '2026-01-01', tipoRastreo: 'CONTINUO', estado: 'ACTIVO', observaciones: null, sedeNombre: 'Chanchamayo' },
    ],
    scopeLabel: 'Todas las sedes',
    generatedAt: new Date('2026-08-15T15:00:00Z'),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('reporte analítico de asistencia', () => {
  it('calcula indicadores y distribución por sede sin inventar datos', () => {
    const model = buildAttendanceReportModel(fixture());
    expect(model.kpis).toMatchObject({ employees: 4, withAttendance: 2, late: 1, absent: 1, authorizedAbsence: 1, overtimeMinutes: 35 });
    expect(model.kpis.attendanceRate).toBe(.5);
    expect(model.detail[0]).toMatchObject({ document: '12345678', employee: 'Carlos Ramírez', status: 'Presente', overtimeMinutes: 35 });
    expect(model.sites).toEqual([
      expect.objectContaining({ site: 'Chanchamayo', employees: 2, withAttendance: 2, attendanceRate: 1 }),
      expect.objectContaining({ site: 'Satipo', employees: 2, withAttendance: 0, attendanceRate: 0 }),
    ]);
  });

  it('construye un libro corporativo con hojas analíticas y filtros', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin logo en pruebas')));
    const workbook = await buildAttendanceWorkbook(fixture());
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([
      'Resumen',
      'Detalle',
      'Análisis por sede',
      'Tendencia',
      'Horas extra',
      'Ausencias y solicitudes',
      'Información',
    ]);
    expect(workbook.getWorksheet('Detalle')?.getTable('DetalleCompletoAsistencia')).toBeDefined();
    expect(workbook.getWorksheet('Resumen')?.getCell('C1').value).toBe('REPORTE EJECUTIVO DE ASISTENCIA');
    const file = await workbook.xlsx.writeBuffer();
    expect(file.byteLength).toBeGreaterThan(10_000);
  }, 20_000);
});
