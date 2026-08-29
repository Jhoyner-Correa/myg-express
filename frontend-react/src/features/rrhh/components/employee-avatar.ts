import type { SyntheticEvent } from 'react';
import avatar01 from '../../../assets/avatars/employee-avatar-01.png';
import avatar02 from '../../../assets/avatars/employee-avatar-02.png';
import avatar03 from '../../../assets/avatars/employee-avatar-03.png';
import avatar04 from '../../../assets/avatars/employee-avatar-04.png';
import avatar05 from '../../../assets/avatars/employee-avatar-05.png';
import avatar06 from '../../../assets/avatars/employee-avatar-06.png';
import avatar07 from '../../../assets/avatars/employee-avatar-07.png';
import avatar08 from '../../../assets/avatars/employee-avatar-08.png';
import type { Employee } from '../types';

type EmployeeAvatarSource = Pick<Employee, 'id' | 'sexo' | 'foto'>;

const employeeAvatars = {
  F: [avatar01, avatar03, avatar06, avatar08],
  M: [avatar02, avatar04, avatar05, avatar07],
} as const;

export function getEmployeeAvatarUrl(employee: EmployeeAvatarSource): string {
  const options = employeeAvatars[employee.sexo];
  return options[Math.abs(employee.id) % options.length] ?? options[0];
}

export function getEmployeePhotoUrl(employee: EmployeeAvatarSource): string {
  return employee.foto?.trim() || getEmployeeAvatarUrl(employee);
}

export function employeePhotoFallbackHandler(employee: EmployeeAvatarSource) {
  return (event: SyntheticEvent<HTMLImageElement>) => {
    if (event.currentTarget.dataset.fallbackApplied === 'true') return;
    event.currentTarget.dataset.fallbackApplied = 'true';
    event.currentTarget.src = getEmployeeAvatarUrl(employee);
    event.currentTarget.alt = '';
  };
}
