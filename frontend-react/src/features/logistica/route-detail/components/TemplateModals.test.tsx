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
const villaRicaTemplate = templates[0]!;

function createCallbacks() {
  return {
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
}

function renderGallery() {
  const callbacks = createCallbacks();

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
    expect(callbacks.onSelect).toHaveBeenCalledWith(villaRicaTemplate);

    callbacks.onSelect.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Villa Rica' }));
    expect(callbacks.onEdit).toHaveBeenCalledWith(villaRicaTemplate);
    expect(callbacks.onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Villa Rica' }));
    expect(callbacks.onDelete).toHaveBeenCalledWith(1);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });

  it('presenta el editor corporativo y valida el archivo adjunto', () => {
    const callbacks = createCallbacks();

    render(
      <TemplateModals
        galleryOpen={false}
        editorOpen
        templates={templates}
        selectedId="1"
        editing={villaRicaTemplate}
        name="Villa Rica"
        body={villaRicaTemplate.cuerpo}
        imageName="Imagen actual"
        imagePreview="/storage/villa-rica.webp"
        {...callbacks}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Editar plantilla' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de plantilla')).toHaveValue('Villa Rica');
    expect(screen.getByLabelText('Mensaje')).toHaveValue(villaRicaTemplate.cuerpo);
    expect(screen.getByText('{codigo_paquete}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
    expect(screen.getByText('Imagen adjunta')).toBeInTheDocument();

    const invalidFile = new File(['contenido'], 'documento.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Cambiar imagen adjunta'), {
      target: { files: [invalidFile] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Formato no compatible');
    expect(callbacks.onImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar imagen adjunta' }));
    expect(callbacks.onRemoveImage).toHaveBeenCalledOnce();
  });
});
