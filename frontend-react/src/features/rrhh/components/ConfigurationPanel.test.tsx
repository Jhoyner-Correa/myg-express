import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfigurationPanel } from './ConfigurationPanel';

vi.mock('../../../core/utils/toast', () => ({ showToast: vi.fn() }));

const props = {
  siteId: 1,
  sites: [{ id: 1, name: 'Chanchamayo', status: 'activo' }],
  roles: [{ id: 4, name: 'Encargado de oficina', description: null, default_tracking_type: 'SOLO_MARCACION' as const }],
  schedules: [],
  geofences: [],
  canManage: true,
  onSiteChange: vi.fn(),
  onCatalogChanged: vi.fn().mockResolvedValue(undefined),
};

describe('ConfigurationPanel', () => {
  it('mantiene configuración enfocada solo en geocercas', () => {
    render(<ConfigurationPanel {...props} view="settings" />);
    expect(screen.getByText('Geocercas por sede')).toBeInTheDocument();
    expect(screen.queryByText('Catálogo de cargos')).not.toBeInTheDocument();
  });

  it('administra cargos dentro de Horarios y calendario', () => {
    render(<ConfigurationPanel {...props} view="schedules" />);
    const navigation = screen.getByRole('navigation', { name: 'Secciones de planificación laboral' });
    expect(Array.from(navigation.querySelectorAll('button')).map(button => button.textContent)).toEqual([
      'Jornadas', 'Semana laboral', 'Días especiales', 'Cargos y funciones',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Cargos y funciones' }));
    expect(screen.getByText('Catálogo de cargos')).toBeInTheDocument();
    expect(screen.getByText('Encargado de oficina')).toBeInTheDocument();
  });
});
