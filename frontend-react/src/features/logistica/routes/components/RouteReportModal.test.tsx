import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReportSummary } from '../types';
import { RouteReportModal } from './RouteReportModal';

const report: ReportSummary = {
  total: 10,
  enviados: 4,
  pendientes: 2,
  fallidos: 1,
  manuales: 2,
  sinWhatsapp: 1,
  manualList: [
    { id: 1, nombre: 'Ana Torres', telefono: '900111222', codigo_paquete: 'PK-001' },
    { id: 2, nombre: 'Luis Ramos', telefono: '900333444', codigo_paquete: 'PK-002' },
  ],
  nowaList: [
    { id: 3, nombre: 'Rosa Díaz', telefono: '900555666', codigo_paquete: 'PK-003' },
  ],
};

describe('RouteReportModal', () => {
  it('presenta el resumen corporativo y el desglose calculado', () => {
    render(
      <RouteReportModal
        open
        loading={false}
        routeName="Villa Rica"
        data={report}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Reporte de ruta' })).toBeInTheDocument();
    expect(screen.getByText('Total de registros')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByLabelText('60% procesado')).toBeInTheDocument();
    expect(screen.getByText('Fallidos / errores')).toBeInTheDocument();
  });

  it('despliega los envíos manuales como una tabla operativa', () => {
    render(
      <RouteReportModal
        open
        loading={false}
        routeName="Villa Rica"
        data={report}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /envío manual/i }));
    const detail = screen.getByRole('region', { name: 'Envíos manuales' });

    expect(within(detail).getByText('Ana Torres')).toBeInTheDocument();
    expect(within(detail).getByText('PK-002')).toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: /copiar todo/i })).toBeInTheDocument();
  });

  it('comunica claramente los estados de carga y error', () => {
    const { rerender } = render(
      <RouteReportModal open loading routeName="Villa Rica" data={null} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Calculando métricas');

    rerender(<RouteReportModal open loading={false} routeName="Villa Rica" data={null} onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar el reporte');
  });
});
