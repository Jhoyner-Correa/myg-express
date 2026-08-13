import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouteLookupResults } from './RouteLookupResults';

describe('RouteLookupResults', () => {
  it('presenta caracteres espa\u00f1oles y el estado vac\u00edo correctamente', () => {
    render(<RouteLookupResults routeId="" records={[]} totalRecords={0} totalGuides={0} localityCount={0} contractFilter="" loading={false} onContractFilter={() => undefined} />);

    expect(screen.getByText('Gu\u00edas')).toBeInTheDocument();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
    expect(screen.getByText('Sin resultados a\u00fan')).toBeInTheDocument();
    expect(screen.getByText('Ingresa un n\u00famero de ruta y selecciona Consultar ruta.')).toBeInTheDocument();
  });

  it('expone el filtro de contrato desde la cabecera de la tabla', () => {
    const onContractFilter = vi.fn();
    const record = { routeId: '100', guia: 'WYB-1', rastreo: 'R-1', cliente: 'Mar\u00eda', telefono: '987654321', contrato: 'TEMU', localidad: 'SATIPO' };
    render(<RouteLookupResults routeId="100" records={[record]} totalRecords={1} totalGuides={1} localityCount={1} contractFilter="" loading={false} onContractFilter={onContractFilter} />);
    fireEvent.click(screen.getByRole('button', { name: /contrato/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /solo temu/i }));
    expect(onContractFilter).toHaveBeenCalledWith('temu');
  });

  it('mantiene disponible el filtro cuando no hay coincidencias visibles', () => {
    render(<RouteLookupResults routeId="100" records={[]} totalRecords={2} totalGuides={2} localityCount={1} contractFilter="temu" loading={false} onContractFilter={() => undefined} />);
    expect(screen.getByRole('button', { name: /contrato/i })).toBeInTheDocument();
    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
    expect(screen.getByText('Mostrando 0 de 2 registros')).toBeInTheDocument();
  });
});
