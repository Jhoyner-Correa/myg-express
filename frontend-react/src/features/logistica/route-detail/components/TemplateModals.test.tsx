import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TemplateItem } from '../types';
import { TemplateModals } from './TemplateModals';

const templates: TemplateItem[] = [
  {
    id: 1,
    nombre: 'Villa Rica',
    cuerpo: 'Hola {nombre}, tu paquete {codigo_paquete} ya llegó.',
    adjunto_url: '/storage/villa-rica.webp',
  },
  {
    id: 2,
    nombre: 'Satipo',
    cuerpo: 'Tu pedido ya se encuentra disponible en nuestra sede.',
  },
];

function renderGallery() {
  const callbacks = {
    onCloseGallery: vi.fn(),
    onBack: vi.fn(),
    onNew: vi.fn(),
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onName: vi.fn(),
    onBody: vi.fn(),
    onImage: vi.fn(),
    onRemoveImage: vi.fn(),
    onSave: vi.fn(),
  };

  render(
    <TemplateModals
      galleryOpen
      editorOpen={false}
      templates={templates}
      selectedId="2"
      editing={null}
      name=""
      body=""
      imageName=""
      imagePreview=""
      {...callbacks}
    />,
  );

  return callbacks;
}

describe('TemplateModals gallery', () => {
  it('separa la selección de las acciones administrativas', () => {
    const callbacks = renderGallery();

    expect(screen.getByRole('dialog', { name: 'Plantillas disponibles' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('En uso en esta ruta')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Usar plantilla Villa Rica' }));
    expect(callbacks.onSelect).toHaveBeenCalledWith(templates[0]);

    callbacks.onSelect.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Villa Rica' }));
    expect(callbacks.onEdit).toHaveBeenCalledWith(templates[0]);
    expect(callbacks.onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Villa Rica' }));
    expect(callbacks.onDelete).toHaveBeenCalledWith(1);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });
});
