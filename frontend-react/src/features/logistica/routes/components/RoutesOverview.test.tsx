import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RouteItem } from '../types';
import { RoutesOverview } from './RoutesOverview';

function route(overrides: Partial<RouteItem>): RouteItem {
  return {
    id: 1,
    nombre_lote: 'Ruta de prueba',
    total_registros: 10,
    estado: 'pendiente',
    fecha: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    entregas_habilitado: 0,
    ...overrides,
  };
}

describe('RoutesOverview', () => {
  it('muestra indicadores calculados y el gráfico', () => {
    const routes = [
      route({ id: 1, estado: 'completado' }),
      route({ id: 2, estado: 'completado' }),
      route({ id: 3, estado: 'pendiente' }),
    ];

    render(<RoutesOverview routes={routes} />);

    expect(screen.getByText('Total de rutas')).toBeInTheDocument();
    expect(screen.getByText('Creadas hoy')).toBeInTheDocument();
    expect(screen.getByText('Finalizadas')).toBeInTheDocument();
    expect(screen.getByText('Completadas exitosamente')).toBeInTheDocument();
    expect(screen.getByText('Tendencia de rutas')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /rutas creadas durante/i })).toBeInTheDocument();
  });

  it('representa correctamente el estado vacío', () => {
    render(<RoutesOverview routes={[]} />);

    const metrics = screen.getByLabelText('Indicadores de rutas');
    expect(within(metrics).getAllByText('0')).toHaveLength(3);
    expect(screen.getByText('+0%')).toBeInTheDocument();
  });
});
