import { describe, expect, it } from 'vitest';
import { buildWeeklyAssignments, validateEmployeeInput } from './domain';
import type { EmployeeInput } from './types';

const validEmployee: EmployeeInput = {
  codigo_empleado: 'MYG-001', sede_id: 2, cargo_id: 1, dni: '12345678', nombres: 'Carlos',
  apellidos: 'Ramírez', sexo: 'M', telefono: '999888777', email: 'carlos@myg.pe',
  fecha_ingreso: '2026-08-13', tipo_rastreo: 'SOLO_MARCACION', estado: 'ACTIVO', observaciones: '',
};

describe('RR. HH. domain', () => {
  it('valida un empleado completo', () => expect(validateEmployeeInput(validEmployee)).toBeNull());
  it('rechaza documentos inválidos', () => expect(validateEmployeeInput({ ...validEmployee, dni: '12A' })).toContain('dígitos'));
  it('construye una semana ordenada y sin duplicados', () => {
    expect(buildWeeklyAssignments(3, [5, 1, 1, 3])).toEqual([
      { weekday: 1, schedule_id: 3 }, { weekday: 3, schedule_id: 3 }, { weekday: 5, schedule_id: 3 },
    ]);
  });
});
