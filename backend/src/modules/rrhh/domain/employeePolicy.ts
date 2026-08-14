import { Empleado } from './Empleado';

const GENDERS = new Set(['M', 'F']);
const TRACKING_TYPES = new Set(['NINGUNO', 'SOLO_MARCACION', 'CONTINUO']);
const STATUSES = new Set(['ACTIVO', 'INACTIVO', 'SUSPENDIDO']);

export function assertEmployeeDefinition(employee: Omit<Empleado, 'id'> | Empleado): void {
  if (!/^[A-Za-z0-9-]{3,30}$/.test(employee.codigoEmpleado.trim())) {
    throw new Error('El código del empleado debe tener entre 3 y 30 caracteres, sin espacios.');
  }
  if (!/^\d{8,12}$/.test(employee.dni.trim())) {
    throw new Error('El documento del empleado debe contener entre 8 y 12 dígitos.');
  }
  if (employee.nombres.trim().length < 2 || employee.nombres.trim().length > 100
      || employee.apellidos.trim().length < 2 || employee.apellidos.trim().length > 100) {
    throw new Error('Los nombres y apellidos deben tener entre 2 y 100 caracteres.');
  }
  if (!Number.isInteger(employee.sedeId) || employee.sedeId < 1
      || !Number.isInteger(employee.cargoId) || employee.cargoId < 1) {
    throw new Error('La sede y el cargo del empleado deben ser válidos.');
  }
  if (!GENDERS.has(employee.sexo) || !TRACKING_TYPES.has(employee.tipoRastreo) || !STATUSES.has(employee.estado)) {
    throw new Error('La clasificación laboral del empleado no es válida.');
  }
  if (!(employee.fechaIngreso instanceof Date) || Number.isNaN(employee.fechaIngreso.getTime())) {
    throw new Error('La fecha de ingreso no es válida.');
  }
  if (employee.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) {
    throw new Error('El correo del empleado no tiene un formato válido.');
  }
  if (employee.telefono && !/^\+?\d{7,15}$/.test(employee.telefono)) {
    throw new Error('El teléfono del empleado debe contener entre 7 y 15 dígitos.');
  }
}
