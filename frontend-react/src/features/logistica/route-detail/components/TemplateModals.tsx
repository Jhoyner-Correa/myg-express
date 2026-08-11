import type { FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { FileImage, FileText, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '../../../../components/ui/Button/Button';
import { Modal } from '../../../../components/ui/Modal/Modal';
import type { TemplateItem } from '../types';
import styles from './TemplateModals.module.css';

interface TemplateModalsProps {
  galleryOpen: boolean;
  editorOpen: boolean;
  templates: TemplateItem[];
  selectedId: string;
  editing: TemplateItem | null;
  name: string;
  body: string;
  imageName: string;
  imagePreview: string;
  onCloseGallery: () => void;
  onBack: () => void;
  onNew: () => void;
  onSelect: (template: TemplateItem) => void;
  onEdit: (template: TemplateItem) => void;
  onDelete: (id: number) => void;
  onName: (value: string) => void;
  onBody: (value: string) => void;
  onImage: (file: File, base64: string) => void;
  onRemoveImage: () => void;
  onSave: (event: FormEvent) => void;
}

function stopAndRun(event: MouseEvent, callback: () => void) {
  event.stopPropagation();
  callback();
}

export function TemplateModals({
  galleryOpen,
  editorOpen,
  templates,
  selectedId,
  editing,
  name,
  body,
  imageName,
  imagePreview,
  onCloseGallery,
  onBack,
  onNew,
  onSelect,
  onEdit,
  onDelete,
  onName,
  onBody,
  onImage,
  onRemoveImage,
  onSave,
}: TemplateModalsProps) {
  const handleImage = (selected?: File) => {
    if (!selected) return;

    const reader = new FileReader();
    reader.onload = () => onImage(selected, String(reader.result ?? ''));
    reader.readAsDataURL(selected);
  };

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    template: TemplateItem,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(template);
  };

  return (
    <>
      <Modal
        open={galleryOpen}
        title="Plantillas disponibles"
        description="Elige una para la ruta o administra tus plantillas."
        onClose={onCloseGallery}
        maxWidth={820}
        footer={
          <Button variant="secondary" onClick={onCloseGallery}>
            Cerrar
          </Button>
        }
      >
        <div className={styles.toolbar}>
          <span className={styles.hint}>{templates.length} plantillas disponibles</span>
          <Button size="sm" icon={<Plus size={15} />} onClick={onNew}>
            Nueva plantilla
          </Button>
        </div>

        <div className={styles.gallery}>
          {templates.length > 0 ? (
            templates.map((template) => {
              const selected = selectedId === String(template.id);

              return (
                <article
                  key={template.id}
                  className={`${styles.card} ${selected ? styles.selected : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  onClick={() => onSelect(template)}
                  onKeyDown={(event) => handleCardKeyDown(event, template)}
                >
                  <div className={styles.cardHead}>
                    <span className={styles.name}>
                      <FileText size={15} aria-hidden="true" />
                      {template.nombre}
                    </span>
                    {template.adjunto_url && (
                      <FileImage size={15} aria-label="Contiene imagen" />
                    )}
                  </div>

                  <p className={styles.body}>{template.cuerpo}</p>

                  <div className={styles.cardFoot}>
                    <span className={styles.badge}>{selected ? 'En uso' : 'Disponible'}</span>
                    <span className={styles.actions}>
                      <button
                        className={styles.iconButton}
                        type="button"
                        aria-label={`Editar ${template.nombre}`}
                        onClick={(event) => stopAndRun(event, () => onEdit(template))}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className={`${styles.iconButton} ${styles.danger}`}
                        type="button"
                        aria-label={`Eliminar ${template.nombre}`}
                        onClick={(event) => stopAndRun(event, () => onDelete(template.id))}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className={styles.empty}>No hay plantillas disponibles.</div>
          )}
        </div>
      </Modal>

      <Modal
        open={editorOpen}
        title={editing ? 'Editar plantilla' : 'Nueva plantilla'}
        description="Guarda un mensaje reutilizable para los envíos."
        onClose={onBack}
        footer={
          <>
            <Button variant="secondary" onClick={onBack}>
              Atrás
            </Button>
            <Button type="submit" form="template-editor-form">
              Guardar
            </Button>
          </>
        }
      >
        <form id="template-editor-form" onSubmit={onSave}>
          <label className={styles.field}>
            Nombre
            <input
              value={name}
              onChange={(event) => onName(event.target.value)}
              required
              placeholder="Ej. Aviso de llegada"
            />
          </label>

          <label className={styles.field}>
            Mensaje
            <textarea
              value={body}
              onChange={(event) => onBody(event.target.value)}
              required
              placeholder="Hola {nombre}, su paquete {codigo_paquete} llegó."
            />
            <span className={styles.hint}>
              Variables: {'{nombre}'}, {'{codigo_paquete}'} y {'{telefono}'}
            </span>
          </label>

          <div className={styles.field}>
            <span>Imagen adjunta (opcional)</span>
            <label className={styles.upload}>
              {imagePreview && (
                <span className={styles.preview}>
                  <img src={imagePreview} alt="Vista previa del adjunto" />
                </span>
              )}
              <Upload size={18} aria-hidden="true" />
              <span>{imageName || 'Seleccionar imagen'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => handleImage(event.target.files?.[0])}
              />
            </label>
            {imageName && (
              <Button size="sm" variant="ghost" type="button" onClick={onRemoveImage}>
                Quitar imagen
              </Button>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
