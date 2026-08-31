import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DestinationPicker } from './DestinationPicker';

const destinations = [
  { id: 8, nombre_lote: 'Ruta 8 - Satipo', zona: 'Satipo', origen: 'Urbano', estado: 'pendiente', fecha: '2026-08-12', total_registros: 12 },
  { id: 9, nombre_lote: 'Ruta 9 - Mazamari', zona: 'Mazamari', origen: 'Urbano', estado: 'pendiente', fecha: '2026-08-12', total_registros: 4 },
];

describe('DestinationPicker', () => {
  it('busca y selecciona una ruta destino', () => {
    const onChange = vi.fn();
    render(<DestinationPicker destinations={destinations} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /seleccionar ruta destino/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /buscar lote destino/i }), { target: { value: 'mazamari' } });
    expect(screen.queryByRole('option', { name: /satipo/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /mazamari/i }));
    expect(onChange).toHaveBeenCalledWith('9');
  });
});
