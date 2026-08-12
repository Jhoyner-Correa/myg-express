import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteLookupPanel } from './RouteLookupPanel';

const defaults = {
  routeId: '123', loading: false, importing: false, connected: true, localities: [], filters: { locality: '', contract: '' as const, sort: 'default' as const }, destinations: [], selectedDestinationId: '', resultCount: 2,
  onRouteId: vi.fn(), onFilters: vi.fn(), onDestination: vi.fn(), onLookup: vi.fn(), onExport: vi.fn(), onImport: vi.fn(),
};

describe('RouteLookupPanel', () => {
  it('oculta la importaciÃ³n y la ruta destino en modo de solo lectura', () => {
    render(<RouteLookupPanel {...defaults} canManage={false} />);
    expect(screen.getByRole('button', { name: /consultar ruta/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /excel/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enviar al lote/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Ruta destino')).not.toBeInTheDocument();
  });

  it('habilita controles de importaciÃ³n para usuarios gestores', () => {
    render(<RouteLookupPanel {...defaults} canManage destinations={[{ id: 8, nombre_lote: 'Satipo', estado: 'pendiente', fecha: '2026-08-12' }]} selectedDestinationId="8" />);
    expect(screen.getByRole('button', { name: /enviar al lote/i })).toBeEnabled();
    expect(screen.getByText('Ruta destino')).toBeInTheDocument();
  });
});
