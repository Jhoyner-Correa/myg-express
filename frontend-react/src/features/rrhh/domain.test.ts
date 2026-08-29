import { describe, expect, it } from 'vitest';
import { buildWeeklyAssignments, validateEmployeeInput, validateWorkCalendarInput } from './domain';
import type { EmployeeInput, WorkCalendarInput } from './types';

const validEmployee: EmployeeInput = {
  sede_id: 2, cargo_id: 1, dni: '12345678', ruc: '20601030013', nombres: 'Carlos',
  apellidos: 'Ramírez', sexo: 'M', telefono: '999888777', email: 'carlos@myg.pe', direccion: 'Av. Principal 123',
  fecha_ingreso: '2026-08-13', tipo_rastreo: 'SOLO_MARCACION', estado: 'ACTIVO', observaciones: '',
};

describe('RR. HH. domain', () => {
  it('valida un empleado completo', () => expect(validateEmployeeInput(validEmployee)).toBeNull());
  it('permite registrar un empleado sin correo', () => expect(validateEmployeeInput({ ...validEmployee, email: '' })).toBeNull());
  it('considera un correo en blanco como no informado', () => expect(validateEmployeeInput({ ...validEmployee, email: '   ' })).toBeNull());
  it('permite registrar un empleado sin RUC', () => expect(validateEmployeeInput({ ...validEmployee, ruc: '' })).toBeNull());
  it('rechaza un RUC con dígito verificador incorrecto', () => expect(validateEmployeeInput({ ...validEmployee, ruc: '20601030014' })).toContain('RUC'));
  it('exige una dirección domiciliaria', () => expect(validateEmployeeInput({ ...validEmployee, direccion: ' ' })).toContain('dirección'));
  it('exige una sede concreta al registrar personal', () => expect(validateEmployeeInput({ ...validEmployee, sede_id: 0 })).toContain('sede'));
  it('rechaza documentos inválidos', () => expect(validateEmployeeInput({ ...validEmployee, dni: '12A' })).toContain('dígitos'));
  it('construye una semana ordenada y sin duplicados', () => {
    expect(buildWeeklyAssignments(3, [5, 1, 1, 3])).toEqual([
      { weekday: 1, schedule_id: 3 }, { weekday: 3, schedule_id: 3 }, { weekday: 5, schedule_id: 3 },
    ]);
  });
  it('valida el alcance y horario de una jornada especial', () => {
    const event: WorkCalendarInput = {
      scope: 'SEDE', site_id: 2, name: 'Inventario anual', type: 'JORNADA_ESPECIAL',
      start_date: '2026-09-10', end_date: '2026-09-10', schedule_id: null, description: null,
    };
    expect(validateWorkCalendarInput(event)).toContain('horario especial');
    expect(validateWorkCalendarInput({ ...event, schedule_id: 3 })).toBeNull();
  });
});
