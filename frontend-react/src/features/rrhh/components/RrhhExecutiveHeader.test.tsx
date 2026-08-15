import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../../../core/auth/authState';
import { RrhhExecutiveHeader } from './RrhhExecutiveHeader';

const user: UserSession = {
  id: 3,
  nombre: 'renzo',
  usuario: 'renzo_admin',
  rol: 'AdminEmpresa',
  rol_label: 'Administrador general',
  alcance: 'EMPRESA',
  sede_id: null,
};

function renderHeader(overrides: Partial<ComponentProps<typeof RrhhExecutiveHeader>> = {}) {
  const props: ComponentProps<typeof RrhhExecutiveHeader> = {
    user,
    sites: [{ id: 2, name: 'Chanchamayo', status: 'ACTIVO' }],
    canViewAllSites: true,
    siteId: null,
    month: '2026-08',
    months: [{ key: '2026-08', label: 'Agosto de 2026' }],
    query: '',
    alerts: [{
      id: 'attendance-3',
      tone: 'critical',
      kind: 'attendance',
      title: 'Carlos Ramírez no registró su entrada',
      site: 'Chanchamayo',
      time: 'Hoy',
      target: '/rrhh/asistencia',
    }],
    onSiteChange: vi.fn(),
    onMonthChange: vi.fn(),
    onQueryChange: vi.fn(),
    onAlertSelect: vi.fn(),
    onAlertsClick: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(<RrhhExecutiveHeader {...props} />);
  return props;
}

describe('RrhhExecutiveHeader', () => {
  it('cambia el alcance y abre una alerta real', () => {
    const props = renderHeader();
    fireEvent.change(screen.getByLabelText('Alcance de sede'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/i }));
    expect(screen.getByRole('dialog', { name: 'Centro de notificaciones' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Carlos Ramírez no registró su entrada/i }));
    expect(props.onSiteChange).toHaveBeenCalledWith(2);
    expect(props.onAlertSelect).toHaveBeenCalledWith('/rrhh/asistencia');
  });

  it('permite abrir la lista completa de alertas', () => {
    const props = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas las alertas' }));
    expect(props.onAlertsClick).toHaveBeenCalledOnce();
  });

  it('enfoca la búsqueda con Ctrl K y permite limpiarla', () => {
    const props = renderHeader({ query: 'Carlos' });
    const search = screen.getByRole('searchbox');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(search).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(props.onQueryChange).toHaveBeenCalledWith('');
  });

  it('muestra los datos de sesión y permite cerrarla', () => {
    const props = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú de sesión' }));
    expect(screen.getByRole('menu')).toHaveTextContent('Toda la empresa');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(props.onLogout).toHaveBeenCalledOnce();
  });
});
