import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RouteItem } from '../types';
import { RouteListSection } from './RouteListSection';

function route(id: number, estado: RouteItem['estado'] = 'pendiente'): RouteItem {
  return {
    id,
    nombre_lote: `Zona ${id}`,
    total_registros: id * 2,
    estado,
    fecha: '2026-08-11T10:00:00-05:00',
    created_at: '2026-08-11T10:00:00-05:00',
    updated_at: '2026-08-11T10:00:00-05:00',
  };
}

describe('RouteListSection', () => {
  it('muestra estados y limita las filas visibles', () => {
    const routes = [route(1, 'completado'), route(2), route(3), route(4), route(5), route(6)];
    render(
      <RouteListSection
        id="routes-test"
        title="Rutas"
        routes={routes}
        dateHeading="Creada"
        getDate={item => item.created_at}
        emptyTitle="Sin rutas"
        renderActions={() => <button type="button">Acción</button>}
        onViewOverflow={() => undefined}
      />,
    );

    expect(screen.getByText('Finalizada')).toBeInTheDocument();
    expect(screen.getByText('6 rutas')).toBeInTheDocument();
    expect(screen.getAllByText('Acción')).toHaveLength(5);
    expect(screen.queryByText('MYG-6')).not.toBeInTheDocument();
  });

  it('comunica el estado vacío y ejecuta la acción principal', () => {
    const onViewAll = vi.fn();
    render(
      <RouteListSection
        id="empty-routes"
        title="Historial"
        routes={[]}
        dateHeading="Finalizada"
        getDate={item => item.updated_at}
        emptyTitle="Sin historial"
        emptyDescription="Todavía no hay rutas finalizadas."
        renderActions={() => null}
        onViewAll={onViewAll}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Sin historial');
    fireEvent.click(screen.getByRole('button', { name: /ver historial completo/i }));
    expect(onViewAll).toHaveBeenCalledOnce();
  });
});
