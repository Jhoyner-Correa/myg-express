import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logistica } from './Logistica';

const { todayRoutes, routesData } = vi.hoisted(() => {
  const now = new Date();
  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');

  const routes = Array.from({ length: 6 }, (_, index) => ({
      id: index + 1,
      nombre_lote: `Zona ${index + 1}`,
      total_registros: 10,
      estado: 'pendiente',
      fecha: `${todayKey}T10:00:00-05:00`,
      created_at: `${todayKey}T10:00:00-05:00`,
      updated_at: `${todayKey}T10:00:00-05:00`,
      entregas_habilitado: 0,
    }));
  return {
    todayRoutes: routes,
    routesData: {
      current: {
        routes,
        zones: [],
        loading: false,
        error: null as unknown,
        reload: vi.fn(),
        refreshZones: vi.fn(),
      },
    },
  };
});

vi.mock('../../core/auth/authState', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      nombre: 'Operador',
      usuario: 'operador',
      rol: 'EncargadoOficina',
      es_superadmin: false,
      sede_id: 1,
      permisos: ['rutas.ver', 'rutas.gestionar', 'avisos.ver', 'entregas.gestionar'],
    },
  }),
}));

vi.mock('./routes/hooks/useRoutesData', () => ({
  useRoutesData: () => routesData.current,
}));

describe('Logistica', () => {
  beforeEach(() => {
    routesData.current = {
      routes: todayRoutes,
      zones: [],
      loading: false,
      error: null,
      reload: vi.fn(),
      refreshZones: vi.fn(),
    };
  });

  it('abre Ver todas con todas las rutas de hoy y sin contaminar el buscador', () => {
    render(<MemoryRouter><Logistica /></MemoryRouter>);

    expect(screen.queryByText('MYG-6')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ver todas/i }));

    expect(screen.getByRole('dialog', { name: 'Rutas de hoy' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /buscar en el historial/i })).toHaveValue('');
    expect(screen.getByText('MYG-6')).toBeInTheDocument();
  });

  it('diferencia un fallo de API de una lista vacía y permite reintentar', () => {
    const reload = vi.fn();
    routesData.current = {
      routes: [],
      zones: [],
      loading: false,
      error: new Error('Servidor no disponible'),
      reload,
      refreshZones: vi.fn(),
    };

    render(<MemoryRouter><Logistica /></MemoryRouter>);

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar las rutas');
    expect(screen.queryByText('No hay rutas registradas hoy')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
