import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ManualClosureModal } from './ManualClosureModal';

describe('ManualClosureModal', () => {
  it('explica que no envía mensajes y exige confirmación explícita', () => {
    const onConfirm = vi.fn();

    render(
      <ManualClosureModal
        open
        affected={9}
        loading={false}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('9 destinatarios')).toBeInTheDocument();
    expect(screen.getByText(/esta acción no envía mensajes/i)).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Confirmar cierre manual' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Medio utilizado' }), {
      target: { value: 'llamada' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /Observación/i }), {
      target: { value: 'Confirmado con los clientes.' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(submit);

    expect(onConfirm).toHaveBeenCalledWith({
      medium: 'llamada',
      observation: 'Confirmado con los clientes.',
    });
  });
});
