import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RouteLookupResults } from './RouteLookupResults';

describe('RouteLookupResults', () => {
  it('presenta caracteres espa\u00f1oles y el estado vac\u00edo correctamente', () => {
    render(<RouteLookupResults routeId="" records={[]} totalRecords={0} localityCount={0} loading={false} />);

    expect(screen.getByText('Gu\u00edas')).toBeInTheDocument();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
    expect(screen.getByText('Sin resultados a\u00fan')).toBeInTheDocument();
    expect(screen.getByText('Ingresa un n\u00famero de ruta para consultar sus gu\u00edas.')).toBeInTheDocument();
  });
});
