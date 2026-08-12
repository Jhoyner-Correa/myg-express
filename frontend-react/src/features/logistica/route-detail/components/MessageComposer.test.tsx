import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionItem } from '../types';
import { MessageComposer } from './MessageComposer';

const disconnectedSession: SessionItem = {
  id: 4,
  nombre: 'Oficina Satipo',
  estado_real: 'disconnected',
};

describe('MessageComposer manual fallback', () => {
  it('permite abrir el cierre manual cuando WhatsApp no está conectado', () => {
    const onOpenManualClosure = vi.fn();

    render(
      <MessageComposer
        session={disconnectedSession}
        template={null}
        contactName="Cliente"
        time="10:30"
        message={null}
        imageUrl=""
        imageError={false}
        manualEligible={4}
        queue={null}
        sending={false}
        onImageError={vi.fn()}
        onOpenTemplates={vi.fn()}
        onOpenControl={vi.fn()}
        onOpenManualClosure={onOpenManualClosure}
        onConfirmSend={vi.fn()}
      />,
    );

    expect(screen.getByText('Sin conexión de WhatsApp')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar mensajes' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Registrar cierre manual' }));
    expect(onOpenManualClosure).toHaveBeenCalledOnce();
  });
});
