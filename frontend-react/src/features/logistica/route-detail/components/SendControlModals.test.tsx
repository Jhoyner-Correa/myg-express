import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionItem, TemplateItem } from '../types';
import { SendControlModals } from './SendControlModals';

const session: SessionItem = {
  id: 7,
  nombre: 'Satipo principal',
  estado_real: 'connected',
  numero_whatsapp: '51916387639',
};

const template: TemplateItem = {
  id: 3,
  nombre: 'Satipo',
  cuerpo: 'Hola {nombre}, tu pedido ya llegó.',
  adjunto_url: '/storage/satipo.webp',
};

function callbacks() {
  return {
    onCloseConfirm: vi.fn(),
    onCloseControl: vi.fn(),
    onStart: vi.fn(),
    onAction: vi.fn(async () => true),
  };
}

describe('SendControlModals confirmation', () => {
  it('expone los requisitos faltantes y evita iniciar un envío inválido', () => {
    const actions = callbacks();

    render(
      <SendControlModals
        confirmOpen
        controlOpen={false}
        queue={null}
        pending={9}
        session={null}
        template={null}
        loading={false}
        {...actions}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Confirmar envío de la ruta' })).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getAllByText('Sin seleccionar')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Iniciar envío' })).toBeDisabled();
  });

  it('permite confirmar cuando el resumen está completo', () => {
    const actions = callbacks();

    render(
      <SendControlModals
        confirmOpen
        controlOpen={false}
        queue={null}
        pending={9}
        session={session}
        template={template}
        loading={false}
        {...actions}
      />,
    );

    expect(screen.getByText('Satipo principal')).toBeInTheDocument();
    expect(screen.getByText('Incluida en la plantilla')).toBeInTheDocument();
    expect(screen.queryByText(/worker|cola/i)).not.toBeInTheDocument();

    const startButton = screen.getByRole('button', { name: 'Iniciar envío' });
    expect(startButton).toBeEnabled();
    fireEvent.click(startButton);
    expect(actions.onStart).toHaveBeenCalledOnce();
  });

  it('presenta una ruta pausada sin exponer detalles internos del sistema', () => {
    const actions = callbacks();

    render(
      <SendControlModals
        confirmOpen={false}
        controlOpen
        queue={{ isPaused: true, pausedJobs: 9 }}
        pending={9}
        session={{ ...session, estado_real: 'disconnected' }}
        template={template}
        loading={false}
        {...actions}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Ruta pausada' })).toBeInTheDocument();
    expect(screen.getByText('Decisión requerida')).toBeInTheDocument();
    expect(screen.getByText('El envío está detenido')).toBeInTheDocument();
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retomar envío' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cierre manual' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancelar pendientes' })).toBeEnabled();
    expect(screen.queryByText(/worker|cola/i)).not.toBeInTheDocument();
  });
});
