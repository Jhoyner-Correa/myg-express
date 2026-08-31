import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RouteItem } from '../types';
import { RouteRowActions } from './RouteRowActions';

const route: RouteItem = {
  id: 17,
  nombre_lote: 'Villa Rica',
  total_registros: 12,
  estado: 'pendiente',
  fecha: '2026-08-11',
  created_at: '2026-08-11T10:00:00-05:00',
  updated_at: '2026-08-11T10:00:00-05:00',
  entregas_habilitado: 0,
};

function renderActions(overrides: Partial<ComponentProps<typeof RouteRowActions>> = {}) {
  const callbacks = {
    onReport: vi.fn(),
    onEdit: vi.fn(),
    onEnableDeliveries: vi.fn(),
    onDelete: vi.fn(),
    onViewDetail: vi.fn(),
  };

  const props: ComponentProps<typeof RouteRowActions> = {
    route,
    canReport: true,
    canEdit: true,
    canEnableDeliveries: true,
    canDelete: true,
    ...callbacks,
    ...overrides,
  };

  render(<RouteRowActions {...props} />);

  return callbacks;
}

describe('RouteRowActions', () => {
  it('mantiene abierto el menú durante pointerdown y ejecuta Enviar a entregas', () => {
    const callbacks = renderActions();

    fireEvent.click(screen.getByRole('button', { name: /más opciones/i }));
    const action = screen.getByRole('menuitem', { name: /enviar a entregas/i });

    fireEvent.pointerDown(action);
    expect(action).toBeInTheDocument();
    fireEvent.click(action);

    expect(callbacks.onEnableDeliveries).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ejecuta Eliminar ruta desde el menú y cierra el desplegable', () => {
    const callbacks = renderActions();

    fireEvent.click(screen.getByRole('button', { name: /más opciones/i }));
    const action = screen.getByRole('menuitem', { name: /eliminar ruta/i });
    fireEvent.pointerDown(action);
    fireEvent.click(action);

    expect(callbacks.onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('cierra el menú con Escape y devuelve el foco al disparador', () => {
    renderActions();
    const trigger = screen.getByRole('button', { name: /más opciones/i });

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('oculta acciones restringidas y conserva el acceso al detalle', () => {
    renderActions({ canReport: false, canEdit: false, canEnableDeliveries: false, canDelete: false });

    expect(screen.queryByRole('button', { name: /ver reporte/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /más opciones/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ver detalle/i })).toBeInTheDocument();
  });
});
