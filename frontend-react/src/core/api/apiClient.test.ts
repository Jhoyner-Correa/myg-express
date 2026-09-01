import { describe, expect, it } from 'vitest';
import { isLoginRequest } from './apiClient';

describe('isLoginRequest', () => {
  it('distingue credenciales incorrectas de una sesión expirada', () => {
    expect(isLoginRequest('/auth/login')).toBe(true);
    expect(isLoginRequest('auth/login?source=web')).toBe(true);
  });

  it('mantiene la protección global para los demás endpoints', () => {
    expect(isLoginRequest('/auth/perfil')).toBe(false);
    expect(isLoginRequest('/rrhh/empleados')).toBe(false);
  });
});
